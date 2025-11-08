use crate::package_name_utils::npm_name_variations;
use oxc_resolver::{ResolveOptions, Resolver};
use std::path::Path;

/// Find longest resolvable npm subpath from WESL module path segments.
///
/// A WESL statement like 'import foo__bar::baz::elem;' references an npm package,
/// an export within that package, a module within the WeslBundle, and an element.
/// This function returns the npm package and export portion.
///
/// Translation involves:
/// - Mapping WESL package names to npm counterparts (e.g., 'foo__bar' -> '@foo/bar')
/// - Probing to find the longest valid export subpath
/// - Handling variations in package naming (foo_bar could be foo-bar in npm)
///
/// Equivalent to TypeScript's `npmResolveWESL` function.
pub fn npm_resolve_wesl(m_path: &[&str], project_dir: &Path) -> Option<String> {
    let options = ResolveOptions {
        condition_names: vec!["node".into(), "import".into()],
        ..Default::default()
    };

    let resolver = Resolver::new(options);

    // Try longest subpaths first
    for sub_path in export_subpaths(m_path) {
        // Try npm name variations to handle sanitized package names
        for npm_path in npm_name_variations(&sub_path) {
            if try_resolve(&npm_path, project_dir, &resolver).is_some() {
                return Some(npm_path);
            }
        }
    }

    None
}

/// Yield possible export subpaths from module path, longest first.
/// Drops the last segment (element name) and iterates down.
fn export_subpaths(m_path: &[&str]) -> Vec<String> {
    let longest = m_path.len() - 1;
    (0..=longest).rev().map(|i| m_path[..i].join("/")).collect()
}

/// Try Node.js module resolution.
fn try_resolve(path: &str, project_dir: &Path, resolver: &Resolver) -> Option<String> {
    resolver
        .resolve(project_dir, path)
        .ok()
        .map(|resolution| resolution.path().display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_subpaths() {
        let paths = export_subpaths(&["foo", "bar", "baz"]);
        assert_eq!(paths, vec!["foo/bar", "foo", ""]);
    }
}
