//! Ciclo de vida do coletor: inicialização local, saúde e encerramento com flush.
use directories::BaseDirs;
use serde_json::Value;
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};
pub struct Settings {
    pub profile: PathBuf,
    pub data: PathBuf,
    pub remote: Option<tauri::Url>,
    pub smoke: bool,
}
impl Settings {
    pub fn load() -> Result<Self, Box<dyn std::error::Error>> {
        let dirs = BaseDirs::new().ok_or("Pasta do usuário indisponível")?;
        // Reutiliza dados/configuração da versão Electron, fora dos arquivos da instalação.
        let profile = dirs.config_dir().join("PainelPingDesktop");
        fs::create_dir_all(&profile)?;
        let _ = dotenvy::from_path(profile.join(".env"));
        let data = std::env::var_os("DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                dirs.data_local_dir().join(if cfg!(windows) {
                    "PainelPing/data"
                } else {
                    "painel-ping/data"
                })
            });
        let remote = std::env::args()
            .find_map(|a| a.strip_prefix("--server=").map(str::to_owned))
            .map(|v| remote_origin(&v))
            .transpose()?;
        Ok(Self {
            profile,
            data,
            remote,
            smoke: std::env::args().any(|a| a == "--smoke-test"),
        })
    }
}
pub fn remote_origin(value: &str) -> Result<tauri::Url, Box<dyn std::error::Error>> {
    let url = tauri::Url::parse(value)?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Informe somente a origem HTTP/HTTPS do coletor, sem credenciais ou caminho.".into(),
        );
    }
    Ok(url)
}
pub struct Collector {
    child: Option<Child>,
}
impl Collector {
    pub fn start(
        settings: &Settings,
        root: PathBuf,
    ) -> Result<(Self, tauri::Url), Box<dyn std::error::Error>> {
        if let Some(url) = &settings.remote {
            return Ok((Self { child: None }, url.clone()));
        }
        let port_file = settings.profile.join("desktop-port.json");
        let preferred = fs::read(&port_file)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .and_then(|v| v["port"].as_u64())
            .filter(|p| *p > 1024 && *p < 65536)
            .unwrap_or(0) as u16;
        let listener = TcpListener::bind(("127.0.0.1", preferred))
            .or_else(|_| TcpListener::bind(("127.0.0.1", 0)))?;
        let port = listener.local_addr()?.port();
        fs::write(
            port_file,
            serde_json::to_vec(&serde_json::json!({"port":port}))?,
        )?;
        drop(listener);
        let mut command = Command::new(root.join(if cfg!(windows) { "node.exe" } else { "node" }));
        command
            .arg(root.join("backend/dist/server.js"))
            .arg("--desktop-stdio")
            .current_dir(&settings.profile)
            .env("NODE_ENV", "production")
            .env("BIND_ADDRESS", "127.0.0.1")
            .env("PORT", port.to_string())
            .env("DATA_DIR", &settings.data)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn()?;
        for pipe in [
            child
                .stdout
                .take()
                .map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
            child
                .stderr
                .take()
                .map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
        ]
        .into_iter()
        .flatten()
        {
            let log = settings.profile.join("desktop.log");
            thread::spawn(move || {
                for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                    if line.contains("Nova chave de administrador") {
                        continue;
                    }
                    if let Ok(mut file) =
                        fs::OpenOptions::new().create(true).append(true).open(&log)
                    {
                        let _ = writeln!(file, "{}", line.chars().take(8192).collect::<String>());
                    }
                }
            });
        }
        Ok((
            Self { child: Some(child) },
            tauri::Url::parse(&format!("http://127.0.0.1:{port}"))?,
        ))
    }
    pub fn exited(&mut self) -> bool {
        self.child
            .as_mut()
            .is_some_and(|c| c.try_wait().ok().flatten().is_some())
    }
    pub fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            // Canal privado, sem endpoint HTTP que permita desligar o monitoramento.
            if let Some(mut input) = child.stdin.take() {
                let _ = input.write_all(b"shutdown\n");
            }
            let deadline = Instant::now() + Duration::from_secs(15);
            while Instant::now() < deadline {
                if child.try_wait().ok().flatten().is_some() {
                    return;
                }
                thread::sleep(Duration::from_millis(100));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
impl Drop for Collector {
    fn drop(&mut self) {
        self.stop();
    }
}
pub fn ready(
    url: &tauri::Url,
    collector: &mut Collector,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()?;
    let deadline = Instant::now() + Duration::from_secs(90);
    while Instant::now() < deadline {
        if collector.exited() {
            return Err("O coletor foi interrompido. Consulte desktop.log; confira se outra versão está usando os dados.".into());
        }
        if let Ok(response) = client.get(url.join("api/health")?).send() {
            if response.status().is_success()
                && response
                    .json::<Value>()
                    .ok()
                    .is_some_and(|v| v["application"] == "painel-ping")
            {
                return Ok(());
            }
        }
        thread::sleep(Duration::from_millis(300));
    }
    Err("O coletor não respondeu. Consulte desktop.log e a origem configurada.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validate_remote_origin() {
        assert!(remote_origin("https://monitor.example:3333").is_ok());
        for v in [
            "file:///etc/passwd",
            "https://user:password@monitor.example",
            "http://monitor.example/api",
            "http://monitor.example/?token=a",
            "http://monitor.example/#a",
        ] {
            assert!(remote_origin(v).is_err());
        }
    }
}
