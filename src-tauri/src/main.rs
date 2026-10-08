#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod admin;
mod runtime;
use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    tray::TrayIconBuilder,
    webview::PageLoadEvent,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
fn main() {
    let collector = Arc::new(Mutex::new(None::<runtime::Collector>));
    let managed = collector.clone();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .invoke_handler(tauri::generate_handler![admin::read_admin_key, admin::copy_admin_key, admin::close_admin_key])
        .setup(move |app| {
            let result = (|| -> Result<(), Box<dyn std::error::Error>> {
                let settings = runtime::Settings::load()?;
                let smoke = settings.smoke;
                let root = if cfg!(debug_assertions) { std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/runtime") } else { app.path().resource_dir()?.join("runtime") };
                let (mut worker, url) = runtime::Collector::start(&settings, root)?;
                runtime::ready(&url, &mut worker)?;
                app.manage(admin::AdminAccess { data: settings.data.clone(), remote: settings.remote.is_some(), clipboard: Mutex::new(None) });
                *managed.lock().unwrap() = Some(worker);
                let open = MenuItem::with_id(app, "open", "Abrir Painel Ping", true, None::<&str>)?;
                let key = MenuItem::with_id(app, "key", "Chave administrativa local", settings.remote.is_none(), None::<&str>)?;
                let exit = MenuItem::with_id(app, "exit", "Encerrar", true, None::<&str>)?;
                app.set_menu(Menu::with_items(app, &[&Submenu::with_items(app, "Painel Ping", true, &[&open, &key, &exit])?])?)?;
                app.on_menu_event(|app, event| match event.id().as_ref() { "open" => show(app), "key" => admin::open(app), "exit" => app.exit(0), _ => {} });
                if !smoke { TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("Painel Ping — coleta ativa").menu(&Menu::with_items(app, &[&open, &key, &exit])?).build(app)?; }
                else { admin::smoke_clipboard()?; }
                let origin = url.origin();
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                    .title("Painel Ping").inner_size(1400.0, 900.0).min_inner_size(800.0, 600.0)
                    .data_directory(settings.profile.join("TauriWebView"))
                    .on_navigation(move |target| target.origin() == origin)
                    .on_page_load(move |w, event| { if smoke && matches!(event.event(), PageLoadEvent::Finished) {
                        // Aguarda React, não somente a resposta HTML do servidor.
                        let _ = w.eval("const probe=setInterval(()=>{if(document.querySelector('main')&&document.querySelector('header')){clearInterval(probe);document.title='PAINEL_PING_SMOKE_OK'}},100)");
                    }})
                    .on_document_title_changed(move |w, title| { if smoke && title == "PAINEL_PING_SMOKE_OK" { let h = w.app_handle().clone(); thread::spawn(move || { thread::sleep(Duration::from_millis(500)); h.exit(0); }); } }).build()?;
                let handle = app.handle().clone(); let watcher = managed.clone();
                thread::spawn(move || {
                    for _ in 0..if smoke { 100 } else { usize::MAX } {
                        thread::sleep(Duration::from_secs(1));
                        if watcher.lock().unwrap().as_mut().is_some_and(|c| c.exited()) { handle.exit(1); return; }
                    } handle.exit(1);
                });
                Ok(())
            })();
            if let Err(error) = &result {
                if !std::env::args().any(|a| a == "--smoke-test") { app.dialog().message(error.to_string()).title("Não foi possível iniciar Painel Ping").blocking_show(); }
            }
            result
        }).build(tauri::generate_context!());
    match app {
        Ok(app) => app.run(move |app, event| match event {
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" && !std::env::args().any(|a| a == "--smoke-test") => {
                api.prevent_close();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            tauri::RunEvent::Exit => {
                if let Some(mut w) = collector.lock().unwrap().take() {
                    w.stop();
                }
            }
            _ => {}
        }),
        Err(error) => {
            eprintln!("Não foi possível iniciar Painel Ping: {error}");
            if let Some(mut w) = collector.lock().unwrap().take() {
                w.stop();
            }
            std::process::exit(1);
        }
    }
}
