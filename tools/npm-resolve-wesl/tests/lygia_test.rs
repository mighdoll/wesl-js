use npm_resolve_wesl::parse::parse_wesl_bundle;
use std::path::PathBuf;

#[test]
fn test_parse_lygia() {
    let lygia_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("node_modules/lygia/dist");

    if !lygia_path.exists() {
        return;
    }

    let bundles: Vec<_> = walkdir::WalkDir::new(&lygia_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name() == "weslBundle.js")
        .take(5)
        .collect();

    if bundles.is_empty() {
        return;
    }

    for entry in bundles {
        let result = parse_wesl_bundle(entry.path()).unwrap();
        assert_eq!(result.name, "lygia");
        assert_eq!(result.edition, "unstable_2025_1");
        assert!(!result.modules.is_empty());
    }
}
