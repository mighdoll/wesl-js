use oxc_resolver::{ResolveOptions, Resolver};
use std::collections::HashSet;
use std::path::Path;

/// Resolve WESL module paths to npm package names.
///
/// This mimics the TypeScript implementation in ParseDependencies.ts.
/// Given module paths like "foo::bar::baz", tries to resolve them as npm packages
/// by testing subpaths from longest to shortest: foo/bar/baz, foo/bar, foo
///
/// # Arguments
/// * `module_paths` - WESL module paths with :: separators
/// * `project_dir` - Directory to resolve from (should contain node_modules)
///
/// # Returns
/// Unique list of resolved npm package names/paths
pub fn resolve_dependencies(module_paths: &[String], project_dir: &Path) -> Vec<String> {
    let options = ResolveOptions {
        condition_names: vec!["node".into(), "import".into()],
        ..Default::default()
    };

    let resolver = Resolver::new(options);
    let mut deps = HashSet::new();

    for module_path in module_paths {
        let segments: Vec<&str> = module_path.split("::").collect();

        // Filter out single segments (likely builtins)
        if segments.len() < 2 {
            continue;
        }

        // Try resolving from longest subpath to shortest
        // This matches the exportSubpaths generator in the TypeScript code
        if let Some(resolved) = unbound_to_dependency(&segments, project_dir, &resolver) {
            deps.insert(resolved);
        }
    }

    deps.into_iter().collect()
}

/// Find the longest resolvable npm subpath from a module path.
///
/// Equivalent to TypeScript's `unboundToDependency` function.
///
/// # Arguments
/// * `segments` - Module path segments (e.g., ["foo", "bar", "baz", "elem"])
/// * `project_dir` - Directory to resolve from
/// * `resolver` - Configured oxc_resolver instance
///
/// # Returns
/// Longest resolvable subpath (e.g., "foo/bar/baz" or "foo/bar"), or None if nothing resolves
fn unbound_to_dependency(
    segments: &[&str],
    project_dir: &Path,
    resolver: &Resolver,
) -> Option<String> {
    // Drop the last segment (element name) and try from longest to shortest
    let longest = segments.len() - 1;

    for i in (1..=longest).rev() {
        let subpath = segments[..i].join("/");

        if try_resolve(&subpath, project_dir, resolver).is_some() {
            return Some(subpath);
        }
    }

    None
}

/// Try to resolve a path using Node's resolution algorithm.
///
/// Equivalent to TypeScript's `tryResolve` function.
///
/// # Arguments
/// * `path` - Package path to resolve (e.g., "foo/bar")
/// * `project_dir` - Directory to resolve from
/// * `resolver` - Configured oxc_resolver instance
///
/// # Returns
/// Resolved path string or None if resolution fails
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
    fn test_resolution_logic() {
        assert_eq!("foo::bar::baz".split("::").collect::<Vec<_>>(), vec!["foo", "bar", "baz"]);
        assert_eq!(vec!["foo", "bar"].join("/"), "foo/bar");
        assert!(resolve_dependencies(&vec!["builtin".to_string()], Path::new(".")).is_empty());
    }
}
