use flate2::read::GzDecoder;
use npm_resolve_wesl::parse::parse_wesl_bundle;
use std::fs;
use std::path::PathBuf;
use tar::Archive;
use tempfile::TempDir;

const LYGIA_URL: &str =
    "https://github.com/mighdoll/lygia/releases/download/v1.3.4-rc.1/lygia-1.3.4-rc.1.tgz";

/// Download and extract the lygia package for testing
fn setup_lygia_package() -> Option<PathBuf> {
    let temp_dir = TempDir::new().ok()?;
    let tgz_path = temp_dir.path().join("lygia.tgz");

    // Try to download the package
    // Note: This will fail if there's no internet connection, which is fine for CI
    let response = match ureq::get(LYGIA_URL).call() {
        Ok(resp) => resp,
        Err(e) => {
            eprintln!("Could not download lygia package: {}", e);
            return None;
        }
    };

    let mut file = fs::File::create(&tgz_path).ok()?;
    let mut reader = response.into_reader();
    std::io::copy(&mut reader, &mut file).ok()?;
    drop(file);

    // Extract the tarball
    let tar_gz = fs::File::open(&tgz_path).ok()?;
    let tar = GzDecoder::new(tar_gz);
    let mut archive = Archive::new(tar);
    archive.unpack(temp_dir.path()).ok()?;

    // The package extracts to a "package" directory
    let package_dir = temp_dir.path().join("package");

    // Keep the temp dir alive by leaking it (for the duration of the test)
    let leaked_path = package_dir.clone();
    std::mem::forget(temp_dir);

    Some(leaked_path)
}

#[test]
fn test_parse_lygia_bundle() {
    // Try to use a cached version first
    let lygia_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("node_modules/lygia");

    let lygia_dir = if lygia_path.exists() {
        lygia_path
    } else {
        match setup_lygia_package() {
            Some(path) => path,
            None => {
                eprintln!("Skipping test: Could not download or find lygia package");
                return;
            }
        }
    };

    // Find weslBundle.js files in the lygia package
    let dist_dir = lygia_dir.join("dist");
    if !dist_dir.exists() {
        eprintln!("Skipping test: lygia dist directory not found");
        return;
    }

    // Try to find any weslBundle.js file
    let bundle_files: Vec<PathBuf> = walkdir::WalkDir::new(&dist_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name() == "weslBundle.js")
        .map(|e| e.path().to_path_buf())
        .collect();

    if bundle_files.is_empty() {
        eprintln!("Skipping test: No weslBundle.js files found in lygia");
        return;
    }

    println!("Found {} bundle files in lygia", bundle_files.len());

    // Parse the first bundle as a sanity check
    let first_bundle = &bundle_files[0];
    let result = parse_wesl_bundle(first_bundle).expect("Failed to parse lygia bundle");

    assert_eq!(result.name, "lygia");
    assert_eq!(result.edition, "unstable_2025_1");
    assert!(
        !result.modules.is_empty(),
        "Expected lygia to have modules"
    );

    println!("Successfully parsed lygia bundle with {} modules", result.modules.len());

    // Lygia should have shader utility functions
    let has_shader_code = result.modules.iter().any(|(_, source)| {
        !source.is_empty()
    });
    assert!(has_shader_code, "Expected lygia to contain shader code");
}

#[test]
fn test_parse_multiple_lygia_bundles() {
    let lygia_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("node_modules/lygia");

    if !lygia_path.exists() {
        eprintln!("Skipping test: lygia not installed. Run: npm install lygia");
        return;
    }

    let dist_dir = lygia_path.join("dist");
    if !dist_dir.exists() {
        eprintln!("Skipping test: lygia dist directory not found");
        return;
    }

    // Find all weslBundle.js files
    let bundle_files: Vec<PathBuf> = walkdir::WalkDir::new(&dist_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name() == "weslBundle.js")
        .map(|e| e.path().to_path_buf())
        .take(10) // Limit to first 10 to keep test fast
        .collect();

    println!("Testing {} lygia bundles", bundle_files.len());

    let mut success_count = 0;
    let mut error_count = 0;

    for bundle_file in &bundle_files {
        match parse_wesl_bundle(bundle_file) {
            Ok(bundle) => {
                assert_eq!(bundle.name, "lygia");
                assert_eq!(bundle.edition, "unstable_2025_1");
                success_count += 1;
            }
            Err(e) => {
                eprintln!("Failed to parse {}: {}", bundle_file.display(), e);
                error_count += 1;
            }
        }
    }

    println!(
        "Parsed {}/{} bundles successfully",
        success_count,
        bundle_files.len()
    );

    // At least some bundles should parse successfully
    assert!(
        success_count > 0,
        "Expected at least some lygia bundles to parse successfully"
    );

    // Most bundles should parse successfully
    assert!(
        error_count < success_count,
        "Too many parsing errors: {} errors vs {} successes",
        error_count,
        success_count
    );
}
