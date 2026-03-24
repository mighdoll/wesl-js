import env::u;

const PI: f32 = 3.14159265358979;
const TWO_PI: f32 = 6.28318530717959;

// === Physics constants (matching notebook) ===
const M: f32 = 1.0;
const G: f32 = 9.81;
const REST_LEN: f32 = 1.0;
// Note: notebook defines k=20 but never uses it in newderiv

// === Simulation parameters (matching notebook: tmax=5, dt=0.01) ===
const DT: f32 = 0.01;
const NUM_SAMPLES: u32 = 501u; // includes initial state at t=0
const SIM_STEPS: u32 = 500u;

// === Histogram parameters ===
// Hash-based histogram for 4D state entropy
const HASH_BINS: u32 = 512u;

// Spring potential P(x) = x^4 - x^2, where x = REST_LEN - L
// Pdot(x) = 4x^3 - 2x
fn spring_force(x: f32) -> f32 {
    return 4.0 * x * x * x - 2.0 * x;
}

// Equations of motion (matches notebook's newderiv exactly)
// pLdot = ptheta^2/(m*L^3) + Pdot(L0-L) + m*g*cos(theta)
// Note: no k multiplier, matching the notebook
fn eom(s: vec4f) -> vec4f {
    let theta = s.x;
    let ptheta = s.y;
    let L = max(s.z, 0.01);
    let pL = s.w;
    let L2 = L * L;
    let L3 = L2 * L;

    let thetadot = ptheta / (M * L2);
    let pthetadot = -M * G * L * sin(theta);
    let Ldot = pL / M;
    let pLdot = ptheta * ptheta / (M * L3)
              + spring_force(REST_LEN - L)
              + M * G * cos(theta);

    return vec4f(thetadot, pthetadot, Ldot, pLdot);
}

// 4th-order Runge-Kutta integrator
fn rk4(s: vec4f, h: f32) -> vec4f {
    let k1 = eom(s);
    let k2 = eom(s + 0.5 * h * k1);
    let k3 = eom(s + 0.5 * h * k2);
    let k4 = eom(s + h * k3);
    return s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

// Encode 4D state to u32 key, matching notebook rounding:
//   theta: mod 2pi, round to 0 decimals (integer)
//   ptheta: round to 1 decimal
//   L: round to 0 decimals (integer)
//   pL: round to 1 decimal
fn encode_state(s: vec4f) -> u32 {
    // theta mod 2pi, rounded to integer: 0..6
    let theta_mod = s.x - floor(s.x / TWO_PI) * TWO_PI;
    let theta_int = u32(clamp(round(theta_mod), 0.0, 6.0));

    // L rounded to integer: 0..15
    let L_int = u32(clamp(round(s.z), 0.0, 15.0));

    // ptheta rounded to 0.1, shifted: 0..2000
    let ptheta_idx = u32(clamp(round(s.y * 10.0) + 1000.0, 0.0, 2000.0));

    // pL rounded to 0.1, shifted: 0..2000
    let pL_idx = u32(clamp(round(s.w * 10.0) + 1000.0, 0.0, 2000.0));

    return theta_int
         | (L_int << 3u)
         | (ptheta_idx << 7u)
         | (pL_idx << 18u);
}

// Hash mixing for uniform bucket distribution
fn hash_mix(x: u32) -> u32 {
    var h = x;
    h ^= h >> 16u;
    h *= 0x45d9f3bu;
    h ^= h >> 16u;
    h *= 0x45d9f3bu;
    h ^= h >> 16u;
    return h;
}

// Simple heatmap: black -> blue -> cyan -> green -> yellow -> red
fn heatmap(t: f32) -> vec3f {
    let s = clamp(t, 0.0, 1.0) * 5.0;
    let i = min(u32(s), 4u);
    let f = fract(s);
    switch i {
        case 0u: { return mix(vec3f(0.0, 0.0, 0.05), vec3f(0.0, 0.0, 1.0), f); }
        case 1u: { return mix(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 1.0), f); }
        case 2u: { return mix(vec3f(0.0, 1.0, 1.0), vec3f(0.0, 1.0, 0.0), f); }
        case 3u: { return mix(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 1.0, 0.0), f); }
        case 4u: { return mix(vec3f(1.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), f); }
        default: { return vec3f(1.0, 0.0, 0.0); }
    }
}

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    // Map pixel to [-1.5, 1.5] x [-1.5, 1.5] (square, centered)
    let res = min(u.resolution.x, u.resolution.y);
    let uv = (pos.xy - 0.5 * u.resolution) / res + 0.5;
    let x0 = mix(-1.5, 1.5, uv.x);
    let y0 = mix(-1.5, 1.5, 1.0 - uv.y);

    // Initial conditions (matches notebook's vary_angle)
    let theta0 = atan2(x0, -y0);
    let L_init = sqrt(x0 * x0 + y0 * y0);

    // Singularity near origin
    if L_init < 0.05 {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    var state = vec4f(theta0, 0.0, L_init, 0.0);

    // Hash-based histogram for 4D state entropy
    var hist: array<u32, 512>;

    // Record initial state (t=0), matching notebook which includes y0
    let key0 = hash_mix(encode_state(state));
    hist[key0 % HASH_BINS] = hist[key0 % HASH_BINS] + 1u;

    // Integrate and record states
    for (var i: u32 = 0u; i < SIM_STEPS; i++) {
        state = rk4(state, DT);

        let key = hash_mix(encode_state(state));
        hist[key % HASH_BINS] = hist[key % HASH_BINS] + 1u;
    }

    // Shannon entropy using natural log (matching scipy.stats.entropy)
    var H: f32 = 0.0;
    let total = f32(NUM_SAMPLES);
    for (var j: u32 = 0u; j < HASH_BINS; j++) {
        if hist[j] > 0u {
            let p = f32(hist[j]) / total;
            H -= p * log(p);
        }
    }

    // Scale to match notebook's entropy range (~5.5 to ~6.3)
    let normalized = clamp((H - 5.5) / 0.8, 0.0, 1.0);
    return vec4f(heatmap(normalized), 1.0);
}
