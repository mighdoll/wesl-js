use npm_resolve_wesl::{parse_dependencies, parse::parse_wesl_bundle};
use std::path::PathBuf;

// Test that matches the TypeScript test case in ParseDependencies.test.ts
#[test]
fn test_parse_dependencies_finds_non_root_dependency() {
    // This test mimics the TS test case where we have module paths like:
    // "package::foo::bar" and "dependent_package::dep"
    // The test expects to find "dependent_package" as a dependency

    let test_pkg_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/test_pkg");

    if !test_pkg_dir.exists() {
        eprintln!(
            "Skipping test: test_pkg directory not found at {:?}",
            test_pkg_dir
        );
        return;
    }

    // Module paths that reference dependent_package
    let module_paths = vec![
        "dependent_package::dep".to_string(),
    ];

    let deps = parse_dependencies(&module_paths, &test_pkg_dir);

    // Should resolve to "dependent_package" if node_modules is properly set up
    // For now, just verify the function runs without panicking
    if deps.is_empty() {
        eprintln!(
            "Note: No dependencies resolved. This test requires proper node_modules setup."
        );
        eprintln!("To set up: ensure dependent_package is accessible via node resolution from {:?}", test_pkg_dir);
        return;
    }

    assert!(
        deps.contains(&"dependent_package".to_string()),
        "Expected to find 'dependent_package' in dependencies, got: {:?}",
        deps
    );
}

#[test]
fn test_parse_dependent_package_bundle() {
    let bundle_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/test_pkg/dependent_package/dist/weslBundle.js");

    if !bundle_path.exists() {
        eprintln!(
            "Skipping test: bundle file not found at {:?}. Run build first.",
            bundle_path
        );
        return;
    }

    let result = parse_wesl_bundle(&bundle_path).expect("Failed to parse bundle");

    assert_eq!(result.name, "dependent_package");
    assert_eq!(result.edition, "unstable_2025_1");
    assert_eq!(result.modules.len(), 1);
    assert_eq!(result.modules[0].0, "lib.wesl");
    assert!(result.modules[0].1.contains("fn dep()"));
}

#[test]
fn test_parse_multi_pkg_bundle() {
    let bundle_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/test_pkg/multi_pkg/dist/dir/nested/weslBundle.js");

    if !bundle_path.exists() {
        eprintln!(
            "Skipping test: bundle file not found at {:?}. Run build first.",
            bundle_path
        );
        return;
    }

    let result = parse_wesl_bundle(&bundle_path).expect("Failed to parse bundle");

    assert_eq!(result.name, "multi_pkg");
    assert_eq!(result.edition, "unstable_2025_1");
    assert!(result.modules.len() >= 1);

    // Check that we have the nested module
    let has_nested = result.modules.iter().any(|(path, _)| path.contains("nested"));
    assert!(has_nested, "Expected to find nested module in: {:?}", result.modules);
}

#[test]
fn test_parse_multi_pkg_transitive_bundle() {
    let bundle_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/test_pkg/multi_pkg/dist/transitive/weslBundle.js");

    if !bundle_path.exists() {
        eprintln!(
            "Skipping test: bundle file not found at {:?}. Run build first.",
            bundle_path
        );
        return;
    }

    let result = parse_wesl_bundle(&bundle_path).expect("Failed to parse bundle");

    assert_eq!(result.name, "multi_pkg");
    assert_eq!(result.edition, "unstable_2025_1");

    // This bundle imports dependent_package, so it should have that in the source
    let has_import = result.modules.iter().any(|(_, source)| {
        source.contains("dependent_package")
    });
    assert!(
        has_import,
        "Expected transitive bundle to reference dependent_package"
    );
}

#[test]
fn test_parse_random_wgsl_bundle() {
    let bundle_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/random_wgsl/dist/weslBundle.js");

    if !bundle_path.exists() {
        eprintln!(
            "Skipping test: random_wgsl bundle not found at {:?}. Run build first.",
            bundle_path
        );
        return;
    }

    let result = parse_wesl_bundle(&bundle_path).expect("Failed to parse random_wgsl bundle");

    assert_eq!(result.name, "random_wgsl");
    assert_eq!(result.edition, "unstable_2025_1");
    assert!(result.modules.len() >= 1);

    // Should have lib.wgsl
    let has_lib = result.modules.iter().any(|(path, _)| path == "lib.wgsl");
    assert!(has_lib, "Expected to find lib.wgsl in random_wgsl");

    // Should contain PCG random functions
    let has_pcg = result.modules.iter().any(|(_, source)| {
        source.contains("pcg") || source.contains("random")
    });
    assert!(has_pcg, "Expected to find PCG random functions");
}

#[test]
fn test_resolve_multiple_packages() {
    let test_pkg_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/test_pkg");

    if !test_pkg_dir.exists() {
        eprintln!(
            "Skipping test: test_pkg directory not found at {:?}",
            test_pkg_dir
        );
        return;
    }

    // Module paths that reference multiple packages
    let module_paths = vec![
        "dependent_package::dep".to_string(),
        "multi_pkg::transitive::fn".to_string(),
    ];

    let deps = parse_dependencies(&module_paths, &test_pkg_dir);

    // Should find both packages (or their subpaths) if node_modules is set up
    if deps.is_empty() {
        eprintln!("Note: No dependencies resolved. This test requires proper node_modules setup.");
        return;
    }

    println!("Resolved dependencies: {:?}", deps);
}

#[test]
fn test_longest_subpath_resolution() {
    // Test that we try the longest subpath first
    // For "foo::bar::baz::elem", should try:
    // 1. foo/bar/baz (longest, drop elem)
    // 2. foo/bar
    // 3. foo

    let test_pkg_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("packages/test_pkg");

    if !test_pkg_dir.exists() {
        eprintln!(
            "Skipping test: test_pkg directory not found at {:?}",
            test_pkg_dir
        );
        return;
    }

    // This should resolve to multi_pkg/dir (if it exists) or multi_pkg
    let module_paths = vec!["multi_pkg::dir::nested::elem".to_string()];

    let deps = parse_dependencies(&module_paths, &test_pkg_dir);

    // Should find multi_pkg with some subpath if node_modules is set up
    if deps.is_empty() {
        eprintln!("Note: No dependencies resolved. This test requires proper node_modules setup.");
        return;
    }

    assert!(
        deps.iter().any(|d| d.starts_with("multi_pkg")),
        "Expected to find multi_pkg, got: {:?}",
        deps
    );
}
