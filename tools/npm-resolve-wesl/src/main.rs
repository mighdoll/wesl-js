use clap::Parser;
use npm_resolve_wesl::parse_dependencies;
use std::path::PathBuf;

/// Resolve WESL module paths to npm packages
///
/// Examples:
///   npm-resolve-wesl random_wgsl::pcg
///   npm-resolve-wesl foo::bar::baz -d /path/to/project
///   npm-resolve-wesl pkg1::fn pkg2::util --json
#[derive(Parser)]
#[command(name = "npm-resolve-wesl")]
#[command(about = "Resolve WESL module paths to npm package names", verbatim_doc_comment)]
struct Cli {
    /// WESL module paths to resolve (e.g., random_wgsl::pcg, foo::bar::baz)
    #[arg(required = true)]
    modules: Vec<String>,

    /// Project directory containing node_modules
    #[arg(short = 'd', long = "dir", default_value = ".")]
    project_dir: PathBuf,

    /// Output as JSON array
    #[arg(short = 'j', long = "json")]
    json: bool,

    /// Verbose output
    #[arg(short = 'v', long = "verbose")]
    verbose: bool,
}

fn main() {
    let cli = Cli::parse();

    if cli.verbose {
        eprintln!("Resolving {} module(s) from {:?}", cli.modules.len(), cli.project_dir);
        for m in &cli.modules {
            eprintln!("  - {}", m);
        }
    }

    let resolved = parse_dependencies(&cli.modules, &cli.project_dir);

    if cli.json {
        println!("{}", serde_json::to_string_pretty(&resolved).unwrap());
    } else {
        if resolved.is_empty() {
            if !cli.verbose {
                eprintln!("No packages resolved. Try --verbose for more info.");
            }
            std::process::exit(1);
        }
        for pkg in resolved {
            println!("{}", pkg);
        }
    }
}
