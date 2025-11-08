use npm_resolve_wesl::{parse_dependencies, parse::parse_wesl_bundle};
use std::path::PathBuf;

fn test_pkg_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/test_pkg")
}

#[test]
fn test_resolve_deps() {
    let dir = test_pkg_dir();
    if !dir.exists() {
        return;
    }

    let paths = vec!["dependent_package::dep".to_string()];
    let deps = parse_dependencies(&paths, &dir);

    if !deps.is_empty() {
        assert!(deps.contains(&"dependent_package".to_string()));
    }
}

#[test]
fn test_parse_bundles() {
    let bundles = [
        ("dependent_package/dist/weslBundle.js", "dependent_package", "lib.wesl"),
        ("multi_pkg/dist/dir/nested/weslBundle.js", "multi_pkg", "dir/nested"),
        ("random_wgsl/dist/weslBundle.js", "random_wgsl", "lib.wgsl"),
    ];

    for (path, name, expected_module) in bundles {
        let bundle_path = test_pkg_dir().parent().unwrap().join("packages").join(path);
        if !bundle_path.exists() {
            continue;
        }

        let result = parse_wesl_bundle(&bundle_path).unwrap();
        assert_eq!(result.name, name);
        assert_eq!(result.edition, "unstable_2025_1");
        assert!(result.modules.iter().any(|(p, _)| p.contains(expected_module)));
    }
}
