fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "read_admin_key",
            "copy_admin_key",
            "close_admin_key",
        ]),
    ))
    .expect("Falha na configuração de permissões desktop");
}
