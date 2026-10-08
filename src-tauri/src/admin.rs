//! Chave e clipboard reservados à janela local, jamais à página HTTP do painel.
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Manager, State, WebviewWindow};
pub struct AdminAccess {
    pub data: PathBuf,
    pub remote: bool,
    pub clipboard: Mutex<Option<arboard::Clipboard>>,
}
fn key(access: &AdminAccess) -> Result<String, String> {
    if access.remote {
        return Err("Consulte a chave no servidor do coletor remoto.".into());
    }
    let key = std::env::var("ADMIN_TOKEN")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let v: serde_json::Value =
                serde_json::from_slice(&fs::read(access.data.join("admin-access.json")).ok()?)
                    .ok()?;
            v["key"].as_str().map(str::to_owned)
        })
        .ok_or("Chave local indisponível")?;
    if !(32..=512).contains(&key.len()) || !key.bytes().all(|b| (33..=126).contains(&b)) {
        return Err("Chave local inválida".into());
    }
    Ok(key)
}
fn authorize(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "admin-key" {
        return Err("Acesso reservado à janela administrativa local".into());
    }
    Ok(())
}
#[tauri::command]
pub fn read_admin_key(window: WebviewWindow, access: State<AdminAccess>) -> Result<String, String> {
    authorize(&window)?;
    key(&access)
}
#[tauri::command]
pub fn copy_admin_key(window: WebviewWindow, access: State<AdminAccess>) -> Result<(), String> {
    authorize(&window)?;
    // Mantém o objeto vivo: no X11, soltar o proprietário pode apagar a seleção copiada.
    let mut clipboard = access
        .clipboard
        .lock()
        .map_err(|_| "Clipboard indisponível")?;
    if clipboard.is_none() {
        *clipboard = Some(arboard::Clipboard::new().map_err(|_| "Clipboard indisponível")?);
    }
    clipboard
        .as_mut()
        .unwrap()
        .set_text(key(&access)?)
        .map_err(|_| "Falha ao copiar a chave".into())
}
#[tauri::command]
pub fn close_admin_key(window: WebviewWindow) -> Result<(), String> {
    authorize(&window)?;
    window.close().map_err(|_| "Falha ao fechar".into())
}
pub fn open(app: &tauri::AppHandle) {
    let app = app.clone();
    // Criar em outra thread evita deadlock do WebView2 em callbacks síncronos de menu.
    std::thread::spawn(move || {
        if let Some(w) = app.get_webview_window("admin-key") {
            let _ = w.show();
            let _ = w.set_focus();
            return;
        }
        let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "admin-key",
            tauri::WebviewUrl::App("admin-key.html".into()),
        )
        .title("Acesso administrativo")
        .inner_size(600.0, 420.0)
        .min_inner_size(400.0, 350.0)
        .on_navigation(|u| {
            (u.scheme() == "tauri" && u.host_str() == Some("localhost"))
                || (matches!(u.scheme(), "http" | "https")
                    && u.host_str() == Some("tauri.localhost"))
        })
        .build();
    });
}
pub fn smoke_clipboard() -> Result<(), Box<dyn std::error::Error>> {
    let mut clipboard = arboard::Clipboard::new()?;
    let previous = clipboard.get_text().unwrap_or_default();
    let example = "0123456789abcdef".repeat(32);
    clipboard.set_text(example.clone())?;
    let result = clipboard.get_text().map(|s| s == example);
    clipboard.set_text(previous)?;
    if !result? {
        return Err("Falha no teste de cópia da chave inteira".into());
    }
    Ok(())
}
