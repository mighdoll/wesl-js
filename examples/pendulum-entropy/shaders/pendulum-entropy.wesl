import env::u;

// === Physics constants ===
const M: f32 = 1.0;
const G: f32 = 9.81;
const K: f32 = 20.0;       // spring constant
const REST_LEN: f32 = 1.0;

// === Simulation parameters ===
const DT: f32 = 0.01;
const NUM_STEPS: u32 = 1000u;

// === Histogram parameters ===
const PL_MIN: f32 = -30.0;
const BIN_WIDTH: f32 = 0.5;
const NUM_BINS: u32 = 121u;  // covers pL in [-30, 30]

// Spring potential P(x) = x^4 - x^2, where x = REST_LEN - L
// Pdot(x) = 4x^3 - 2x
fn spring_force(x: f32) -> f32 {
    return 4.0 * x * x * x - 2.0 * x;
}

// Equations of motion for the spring pendulum
// State: (theta, ptheta, L, pL)
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
              + K * spring_force(REST_LEN - L)
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

    // Initial conditions: position -> (theta, L), zero momentum
    let theta0 = atan2(x0, -y0);
    let L_init = sqrt(x0 * x0 + y0 * y0);

    // Singularity near origin
    if L_init < 0.05 {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    var state = vec4f(theta0, 0.0, L_init, 0.0);

    // Histogram of rounded pL values
    var hist: array<u32, 121>;

    for (var i: u32 = 0u; i < NUM_STEPS; i++) {
        state = rk4(state, DT);

        let pL = state.w;
        let bin_f = clamp(
            (round(pL / BIN_WIDTH) * BIN_WIDTH - PL_MIN) / BIN_WIDTH,
            0.0,
            f32(NUM_BINS - 1u)
        );
        let bin = u32(bin_f);
        hist[bin] = hist[bin] + 1u;
    }

    // Shannon entropy
    var H: f32 = 0.0;
    let total = f32(NUM_STEPS);
    for (var j: u32 = 0u; j < NUM_BINS; j++) {
        if hist[j] > 0u {
            let p = f32(hist[j]) / total;
            H -= p * log2(p);
        }
    }

    let normalized = pow(H / log2(f32(NUM_BINS)), 2.5);
    return vec4f(heatmap(normalized), 1.0);
}
