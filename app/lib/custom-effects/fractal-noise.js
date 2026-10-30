// lib/custom-effects/CodeComponentId_958fe881d756f1ed00b026088be0edf83e0d6a97_431.ts
// Copied from Figma (Rectangle 6, node 64:1277). Only change: TypeScript type
// annotations removed from defineProperties so this runs as plain JavaScript.
// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component,
  _properties,
) {}

// Fractal Noise Fill Static
// Generates static layered procedural noise as a custom fill.
// Authors: Tim Murray-Browne
export default function Effect() { }
export function setup(device, frame) {
    var WGSL = `
    diagnostic(off,derivative_uniformity);

    // ----- Uniforms -----
    // All values are packed as a flat list of f32s (see render()).
    // Booleans/dropdowns are passed as f32 and converted with u32()/!= 0.0.
    struct Uniforms {
      width: f32,
      height: f32,
      chroma: f32,
      noiseType: f32,                   // 0 Value, 1 Perlin, 2 Simplex, 3 Voronoise
      seed: f32,
      turbulence: f32,
      interpolation: f32,
      centerX: f32,
      centerY: f32,
      scaleX: f32,
      scaleY: f32,
      angle: f32,                       // radians
      tileSizeX: f32,
      tileSizeY: f32,
      numHarmonics: f32,
      harmonicBlendMode: f32,
      harmonicAmplitude: f32,
      harmonicScale: f32,
      harmonicRotation: f32,            // radians
      flow: f32,
      evolution: f32,
      evolutionLoop: f32,
      _pad0: f32,
      _pad1: f32,
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;

    struct VsIn {
      @location(0) pos: vec2f,
      @location(1) uv: vec2f,
    };
    struct VsOut {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };

    @vertex fn vs_main(in: VsIn) -> VsOut {
      var out: VsOut;
      out.position = vec4f(in.pos, 0.0, 1.0);
      out.uv = in.uv;
      return out;
    }

    // ===================== Constants =====================
    const TAU: f32 = 6.28318530718;

    const NOISE_TYPE_VALUE = 0u;
    const NOISE_TYPE_PERLIN = 1u;
    const NOISE_TYPE_SIMPLEX = 2u;
    const NOISE_TYPE_VORONOI = 3u;

    const BLEND_ADD = 0u;
    const BLEND_MIN = 1u;
    const BLEND_MAX = 2u;
    const BLEND_ADD_ABSOLUTE = 3u;
    const BLEND_SUBTRACT_ABSOLUTE = 4u;
    const BLEND_ADD_MULTIPLIED = 5u;
    const BLEND_EXCLUSION = 6u;
    const BLEND_COARSE_KNOCKOUT = 7u;
    const BLEND_FINE_KNOCKOUT = 8u;

    const GREEN_SEED_OFFSET = 23;
    const BLUE_SEED_OFFSET = 47;
    const VORONOISE_JITTER: f32 = 0.5;

    const ROTATE_OFF_AXIS: mat3x3f = mat3x3f(
        vec3f(0.76373894, 0.57551857, -0.2923717),
        vec3f(-0.53386483, 0.8177475, 0.21512176),
        vec3f(0.3628928, -0.0082099, 0.93179473)
    );

    // ===================== Math helpers =====================
    fn rot(t: f32) -> mat2x2f {
        let cosT = cos(t);
        let sinT = sin(t);
        return mat2x2f(cosT, -sinT, sinT, cosT);
    }

    fn map3(x: vec3f, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> vec3f {
        return outMin + (x - inMin) * (outMax - outMin) / (inMax - inMin);
    }

    // ===================== Random / noise primitives =====================
    // Random float in range [0, 1).
    fn rand(inF: vec3f) -> f32 {
        var x = bitcast<vec3<u32>>(inF);
        let k = 1103515245u;
        x = ((x >> vec3<u32>(8u)) ^ x.yzx) * k;
        x = ((x >> vec3<u32>(8u)) ^ x.yzx) * k;
        x = ((x >> vec3<u32>(8u)) ^ x.yzx) * k;
        let outI = x.x ^ x.y ^ x.z;
        let outF = (127u << 23u) | (outI & ((1u << 23u) - 1u));
        return bitcast<f32>(outF) - 1.0;
    }

    // Random float in range [-1, 1).
    fn rand0(inF: vec3f) -> f32 {
        return rand(inF) * 2.0 - 1.0;
    }

    struct DerivativeNoise {
        derivative: vec3f,
        noise: f32,
    };
    struct DerivativeNoise3 {
        // Note: derivative is only calculated for the Red (.x) channel of noise
        derivative: vec3f,
        noise: vec3f,
    };

    // x mod period for non-zero components of period; output in range [-period/2, period/2]
    fn wrapToPeriod3(x: vec3f, period: vec3f) -> vec3f {
        let xMod = select(x, x - floor(x / (period + vec3f(0.00001))) * period, period != vec3f(0.0));
        return xMod - select(vec3f(0.0), period, xMod > period * 0.5);
    }
    fn wrapToPeriod2(x: vec2f, period: vec2f) -> vec2f {
        let xMod = select(x, x - floor(x / (period + vec2f(0.00001))) * period, period != vec2f(0.0));
        return xMod - select(vec2f(0.0), period, xMod > period * 0.5);
    }

    fn cubicFade3(t: vec3f) -> vec3f { return t * t * (3.0 - 2.0 * t); }
    fn cubicFade3Derivative(t: vec3f) -> vec3f { return 6.0 * t * (1.0 - t); }
    fn cubicFade3Clamped(lb: vec3f, ub: vec3f, t: vec3f) -> vec3f {
        let x = clamp((t - lb) / (ub - lb), vec3f(0.0), vec3f(1.0));
        return cubicFade3(x);
    }
    fn cubicFade3ClampedDerivative(lb: vec3f, ub: vec3f, t: vec3f) -> vec3f {
        let x = clamp((t - lb) / (ub - lb), vec3f(0.0), vec3f(1.0));
        return cubicFade3Derivative(x);
    }

    fn quinticFade3(t: vec3f) -> vec3f { return t * t * t * (t * (t * 6. - 15.) + 10.); }
    fn quinticFade3Derivative(t: vec3f) -> vec3f { return 30 * t * t * (t * (t - 2) + 1); }
    fn sharpenDerivativeNoise(dn: DerivativeNoise, smoothness: f32, isDerivativeRequired: bool, isNoiseRequired: bool) -> DerivativeNoise {
        var out = dn;
        let sharpness = clamp(1.0 - smoothness, 0.0, 1.0);
        if (sharpness <= 0.001) {
            return out;
        }

        let exponent = mix(1.0, 0.45, sharpness);
        let absNoise = abs(dn.noise);
        if (isNoiseRequired) {
            out.noise = sign(dn.noise) * pow(absNoise, exponent);
        }
        if (isDerivativeRequired) {
            let slope = exponent * pow(max(absNoise, 0.02), exponent - 1.0);
            out.derivative = dn.derivative * min(slope, 4.0);
        }
        return out;
    }

    fn linearlyInterpolateOverCube(v000: f32, v100: f32, v010: f32, v110: f32, v001: f32, v101: f32, v011: f32, v111: f32, fadeXYZ: vec3f) -> f32 {
        let v00 = mix(v000, v100, fadeXYZ.x);
        let v01 = mix(v001, v101, fadeXYZ.x);
        let v10 = mix(v010, v110, fadeXYZ.x);
        let v11 = mix(v011, v111, fadeXYZ.x);
        let v0 = mix(v00, v10, fadeXYZ.y);
        let v1 = mix(v01, v11, fadeXYZ.y);
        return mix(v0, v1, fadeXYZ.z);
    }

    fn linearlyInterpolateOverCube3(v000: vec3f, v100: vec3f, v010: vec3f, v110: vec3f, v001: vec3f, v101: vec3f, v011: vec3f, v111: vec3f, fadeXYZ: vec3f) -> vec3f {
        let v00 = mix(v000, v100, fadeXYZ.x);
        let v01 = mix(v001, v101, fadeXYZ.x);
        let v10 = mix(v010, v110, fadeXYZ.x);
        let v11 = mix(v011, v111, fadeXYZ.x);
        let v0 = mix(v00, v10, fadeXYZ.y);
        let v1 = mix(v01, v11, fadeXYZ.y);
        return mix(v0, v1, fadeXYZ.z);
    }

    fn linearlyInterpolateOverCubeDerivative(v000: f32, v100: f32, v010: f32, v110: f32, v001: f32, v101: f32, v011: f32, v111: f32, fadeXYZ: vec3f, fadeXYZDerivative: vec3f) -> vec3f {
        let a = v000; let b = v100; let c = v010; let d = v110;
        let e = v001; let f = v101; let g = v011; let h = v111;
        let k0 = (b - a);
        let k1 = (c - a);
        let k2 = (e - a);
        let k3 = (a + d - b - c);
        let k4 = (a + f - b - e);
        let k5 = (a + g - c - e);
        let k6 = (b + c + e + h - a - d - f - g);
        let uu = fadeXYZ.x;
        let vv = fadeXYZ.y;
        let ww = fadeXYZ.z;
        let du = fadeXYZDerivative.x;
        let dv = fadeXYZDerivative.y;
        let dw = fadeXYZDerivative.z;
        return vec3f(
            du * (k0 + vv * k3 + ww * k4 + vv * ww * k6),
            dv * (k1 + uu * k3 + ww * k5 + uu * ww * k6),
            dw * (k2 + uu * k4 + vv * k5 + uu * vv * k6)
        );
    }

    // ----- Value noise -----
    fn valueNoise3DerivativeNoise(pos: vec3f, period: vec3f, interpolation_amount: f32, seed: i32, isGradientRequired: bool, isNoiseRequired: bool) -> DerivativeNoise {
        let iPos = floor(pos);
        let fPos = fract(pos);

        let i000 = iPos;
        let i100 = i000 + vec3f(1.0, 0.0, 0.0);
        let i010 = i000 + vec3f(0.0, 1.0, 0.0);
        let i110 = i000 + vec3f(1.0, 1.0, 0.0);
        let i001 = i000 + vec3f(0.0, 0.0, 1.0);
        let i101 = i000 + vec3f(1.0, 0.0, 1.0);
        let i011 = i000 + vec3f(0.0, 1.0, 1.0);
        let i111 = i000 + vec3f(1.0, 1.0, 1.0);

        let v000 = rand0(wrapToPeriod3(i000, period) + vec3f(f32(seed)));
        let v100 = rand0(wrapToPeriod3(i100, period) + vec3f(f32(seed)));
        let v010 = rand0(wrapToPeriod3(i010, period) + vec3f(f32(seed)));
        let v110 = rand0(wrapToPeriod3(i110, period) + vec3f(f32(seed)));
        let v001 = rand0(wrapToPeriod3(i001, period) + vec3f(f32(seed)));
        let v101 = rand0(wrapToPeriod3(i101, period) + vec3f(f32(seed)));
        let v011 = rand0(wrapToPeriod3(i011, period) + vec3f(f32(seed)));
        let v111 = rand0(wrapToPeriod3(i111, period) + vec3f(f32(seed)));

        let sharpness = vec3f(1.0 - interpolation_amount, 1.0 - interpolation_amount, 0.0);
        let lb = sharpness * 0.4999;
        let ub = vec3f(1.0) - lb;
        let fadeXYZ: vec3f = cubicFade3Clamped(lb, ub, fPos);

        var derivativeNoise = DerivativeNoise(vec3f(0.0), 0.0);
        if (isGradientRequired) {
            let fadeXYZDerivative: vec3f = cubicFade3ClampedDerivative(lb, ub, fract(fPos));
            derivativeNoise.derivative = linearlyInterpolateOverCubeDerivative(v000, v100, v010, v110, v001, v101, v011, v111, fadeXYZ, fadeXYZDerivative);
        }
        if (isNoiseRequired) {
            derivativeNoise.noise = linearlyInterpolateOverCube(v000, v100, v010, v110, v001, v101, v011, v111, fadeXYZ);
        }
        return derivativeNoise;
    }

    // ----- Perlin noise -----
    fn perlinGradientDirection(p: vec3f) -> vec3f {
        let hash = u32(floor(rand(p) * 16.0));
        switch (hash) {
            case 0u { return vec3f(1.0, 1.0, 0.0); }
            case 1u { return vec3f(-1.0, 1.0, 0.0); }
            case 2u { return vec3f(1.0, -1.0, 0.0); }
            case 3u { return vec3f(-1.0, -1.0, 0.0); }
            case 4u { return vec3f(1.0, 0.0, 1.0); }
            case 5u { return vec3f(-1.0, 0.0, 1.0); }
            case 6u { return vec3f(1.0, 0.0, -1.0); }
            case 7u { return vec3f(-1.0, 0.0, -1.0); }
            case 8u { return vec3f(0.0, 1.0, 1.0); }
            case 9u { return vec3f(0.0, -1.0, 1.0); }
            case 10u { return vec3f(0.0, 1.0, -1.0); }
            case 11u { return vec3f(0.0, -1.0, -1.0); }
            case 12u { return vec3f(1.0, 1.0, 0.0); }
            case 13u { return vec3f(-1.0, 1.0, 0.0); }
            case 14u { return vec3f(0.0, -1.0, 1.0); }
            case 15u, default: { return vec3f(0.0, -1.0, -1.0); }
        }
    }

    fn periodicPerlin3DerivativeNoise(P: vec3f, period: vec3f, seed: i32, isDerivativeRequired: bool, isNoiseRequired: bool) -> DerivativeNoise {
        let scaledP = P + vec3f(f32(seed));
        let Pi0: vec3f = wrapToPeriod3(floor(scaledP), period);
        let Pi1: vec3f = wrapToPeriod3(Pi0 + vec3f(1.), period);
        let Pf0 = fract(scaledP);
        let Pf1 = Pf0 - vec3f(1.);

        let g000 = perlinGradientDirection(vec3f(Pi0.x, Pi0.y, Pi0.z));
        let g100 = perlinGradientDirection(vec3f(Pi1.x, Pi0.y, Pi0.z));
        let g010 = perlinGradientDirection(vec3f(Pi0.x, Pi1.y, Pi0.z));
        let g110 = perlinGradientDirection(vec3f(Pi1.x, Pi1.y, Pi0.z));
        let g001 = perlinGradientDirection(vec3f(Pi0.x, Pi0.y, Pi1.z));
        let g101 = perlinGradientDirection(vec3f(Pi1.x, Pi0.y, Pi1.z));
        let g011 = perlinGradientDirection(vec3f(Pi0.x, Pi1.y, Pi1.z));
        let g111 = perlinGradientDirection(vec3f(Pi1.x, Pi1.y, Pi1.z));

        let n000 = dot(g000, Pf0);
        let n100 = dot(g100, vec3f(Pf1.x, Pf0.y, Pf0.z));
        let n010 = dot(g010, vec3f(Pf0.x, Pf1.y, Pf0.z));
        let n110 = dot(g110, vec3f(Pf1.x, Pf1.y, Pf0.z));
        let n001 = dot(g001, vec3f(Pf0.x, Pf0.y, Pf1.z));
        let n101 = dot(g101, vec3f(Pf1.x, Pf0.y, Pf1.z));
        let n011 = dot(g011, vec3f(Pf0.x, Pf1.y, Pf1.z));
        let n111 = dot(g111, Pf1);

        var fadeXYZ: vec3f = quinticFade3(Pf0);
        var derivativeNoise = DerivativeNoise(vec3f(0.0), 0.0);

        if (isDerivativeRequired) {
            let fadeXYZDerivative = quinticFade3Derivative(Pf0);
            derivativeNoise.derivative = linearlyInterpolateOverCubeDerivative(n000, n100, n010, n110, n001, n101, n011, n111, fadeXYZ, fadeXYZDerivative);
            let gradientContribution = linearlyInterpolateOverCube3(g000, g100, g010, g110, g001, g101, g011, g111, fadeXYZ);
            derivativeNoise.derivative += gradientContribution;
        }
        if (isNoiseRequired) {
            derivativeNoise.noise = linearlyInterpolateOverCube(n000, n100, n010, n110, n001, n101, n011, n111, fadeXYZ);
        }
        return derivativeNoise;
    }

    // ----- Voronoise -----
    fn voronoise3DerivativeNoise(pos: vec3f, period: vec3f, smoothness: f32, jitter: f32, seed: i32, isRgb: bool, isDerivativeRequired: bool, isNoiseRequired: bool) -> DerivativeNoise3 {
        let n: vec2f = floor(pos.xy);
        let f: vec2f = fract(pos.xy);

        var outColor = vec3f(0.0, 0.0, 0.0);
        let k: f32 = 0.01 + 1.0 + 63.0 * pow(1.0 - smoothness, 6.0);

        var totalW = 0.0;
        var totalDwDx = vec3f(0.0);
        var totalDwcDx = vec3f(0.0);
        var outColorMono: f32 = 0.0;

        for (var j = -2; j <= 2; j++) {
            for (var i = -2; i <= 2; i++) {
                let ij: vec2f = vec2(f32(i), f32(j));
                let nij = wrapToPeriod2(n + ij, period.xy);
                var vertexHash = vec2(
                    rand0(vec3f(nij, f32(seed))),
                    rand0(vec3f(nij, f32(seed + 37)))
                );
                var offset: vec2f;

                let maxDeviation = 0.5 * jitter;
                var zPeriod: f32;
                {
                    let isLooping = period.z != 0.0;
                    let minPeriod = 2.0;
                    let maxPeriod = 15.0;
                    let timelinePeriod = select(maxPeriod, period.z, isLooping);
                    var r = timelinePeriod / maxPeriod + (timelinePeriod / minPeriod - timelinePeriod / maxPeriod) * rand(vec3f(nij, f32(seed + 47)));
                    r = select(r, round(r), isLooping);
                    zPeriod = timelinePeriod / r;
                }
                offset = 0.5 + maxDeviation * sin(pos.z * TAU / zPeriod + 6.2831 * vertexHash);

                let d = length(ij - f + offset);

                var col: vec3f;
                var colMono: f32 = 0.0;
                if (isRgb) {
                    col = vec3f(
                        rand0(vec3(nij, f32(seed) + 0.3)),
                        rand0(vec3(nij, f32(seed) + 23.8)),
                        rand0(vec3(nij, f32(seed) + 47.7))
                    );
                    if (isDerivativeRequired) {
                        colMono = (col.r + col.g + col.b) / 3.0;
                    }
                } else {
                    colMono = rand0(vec3(nij, f32(seed) + 0.3));
                    col = vec3f(colMono, colMono, colMono);
                }

                let w = pow(1.0 - smoothstep(0.0, 1.414, d), k);
                totalW += w;

                if (isNoiseRequired) {
                    outColor += w * col;
                }

                if (isDerivativeRequired) {
                    outColorMono += w * colMono;

                    var doffsetXdz: f32;
                    var doffsetYdz: f32;
                    if (period.z == 0) {
                        doffsetXdz = maxDeviation * cos(pos.z + 6.2831 * vertexHash.x);
                        doffsetYdz = maxDeviation * cos(pos.z + 6.2831 * vertexHash.y);
                    } else {
                        let doMovingXdz = maxDeviation * cos(pos.z * TAU / zPeriod + 6.2831 * vertexHash.x) * TAU / zPeriod;
                        let doMovingYdz = maxDeviation * cos(pos.z * TAU / zPeriod + 6.2831 * vertexHash.y) * TAU / zPeriod;
                        doffsetXdz = doMovingXdz;
                        doffsetYdz = doMovingYdz;
                    }
                    let doffsetdz = vec2f(doffsetXdz, doffsetYdz);

                    let dddx_or_dy: vec2f = -(ij - f + offset) / d;
                    let dddz: f32 = dot(ij - f + offset, doffsetdz) / d;
                    let dddx = vec3f(dddx_or_dy.x, dddx_or_dy.y, dddz);

                    let dudx = (1.5 * sqrt(2.0) * d * d - 3 * d) * dddx;
                    let dwdx = k * pow(1.0 - max(0.0001, smoothstep(0.0, 1.414, d)), k - 1) * dudx;
                    totalDwDx += dwdx;
                    totalDwcDx += dwdx * colMono;
                }
            }
        }

        var dn = DerivativeNoise3(vec3f(0.0), vec3f(0.0));
        if (isNoiseRequired) {
            dn.noise = outColor / totalW;
        }
        if (isDerivativeRequired) {
            let totalWSquared = max(totalW * totalW, 1.0e-37);
            dn.derivative = (totalDwcDx * totalW - outColorMono * totalDwDx) / (totalWSquared);
        }
        return dn;
    }

    // ----- Gustavson & McEwan 2022 Simplex noise -----
    fn mod289v4f(i: vec4f) -> vec4f {
        return i - floor(i / 289.0) * 289.0;
    }
    fn permute289v4f(i: vec4f) -> vec4f {
        var iMod = mod289v4f(i);
        return mod289v4f((iMod * 34.0 + 10.0) * iMod);
    }

    fn periodicSimplex3DerivativeNoise(x: vec3f, p: vec3f, seed: i32, isDerivativeRequired: bool, isNoiseRequired: bool) -> DerivativeNoise {
        let M = mat3x3f(0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0);
        let Mi = mat3x3f(-0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5);

        let uvw = M * x;
        var i0 = floor(uvw);
        let f0 = uvw - i0;
        let gt_ = step(f0.xyx, f0.yzz);
        let lt_ = 1.0 - gt_;
        let gt = vec3f(lt_.z, gt_.xy);
        let lt = vec3f(lt_.xy, gt_.z);
        let o1 = min(gt, lt);
        let o2 = max(gt, lt);
        var i1 = i0 + o1;
        var i2 = i0 + o2;
        var i3 = i0 + vec3f(1.0, 1.0, 1.0);
        var v0 = Mi * i0;
        var v1 = Mi * i1;
        var v2 = Mi * i2;
        var v3 = Mi * i3;
        let x0 = x - v0;
        let x1 = x - v1;
        let x2 = x - v2;
        let x3 = x - v3;

        if (any(p > vec3f(0.0))) {
            var vx = vec4f(v0.x, v1.x, v2.x, v3.x);
            var vy = vec4f(v0.y, v1.y, v2.y, v3.y);
            var vz = vec4f(v0.z, v1.z, v2.z, v3.z);
            if (p.x > 0.0) { vx = vx - floor(vx / p.x) * p.x; }
            if (p.y > 0.0) { vy = vy - floor(vy / p.y) * p.y; }
            if (p.z > 0.0) { vz = vz - floor(vz / p.z) * p.z; }
            i0 = floor(M * vec3f(vx.x, vy.x, vz.x) + 0.5);
            i1 = floor(M * vec3f(vx.y, vy.y, vz.y) + 0.5);
            i2 = floor(M * vec3f(vx.z, vy.z, vz.z) + 0.5);
            i3 = floor(M * vec3f(vx.w, vy.w, vz.w) + 0.5);
        }
        i0 += vec3f(f32(seed));
        i1 += vec3f(f32(seed));
        i2 += vec3f(f32(seed));
        i3 += vec3f(f32(seed));

        let hash = permute289v4f(permute289v4f(permute289v4f(
            vec4f(i0.z, i1.z, i2.z, i3.z))
            - vec4f(i0.y, i1.y, i2.y, i3.y))
            - vec4f(i0.x, i1.x, i2.x, i3.x));
        let theta = hash * 4.883222077;
        let sz = hash * -0.006920415 + 0.996539792;
        let Ct = cos(theta);
        let St = sin(theta);
        let sz_ = sqrt(1.0 - sz * sz);

        let gx = Ct * sz_;
        let gy = St * sz_;
        let gz = sz;

        let g0 = vec3f(gx.x, gy.x, gz.x);
        let g1 = vec3f(gx.y, gy.y, gz.y);
        let g2 = vec3f(gx.z, gy.z, gz.z);
        let g3 = vec3f(gx.w, gy.w, gz.w);
        var w = 0.5 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3));
        w = max(w, vec4f(0.0, 0.0, 0.0, 0.0));
        let w2 = w * w;
        let w3 = w2 * w;
        let gdotx = vec4f(dot(g0, x0), dot(g1, x1), dot(g2, x2), dot(g3, x3));

        var derivativeNoise = DerivativeNoise(vec3f(0.0), 0.0);
        if (isNoiseRequired) {
            derivativeNoise.noise = 39.5 * dot(w3, gdotx);
        }
        if (isDerivativeRequired) {
            let dw: vec4f = -6.0 * w2 * gdotx;
            let dn0: vec3f = w3.x * g0 + dw.x * x0;
            let dn1: vec3f = w3.y * g1 + dw.y * x1;
            let dn2: vec3f = w3.z * g2 + dw.z * x2;
            let dn3: vec3f = w3.w * g3 + dw.w * x3;
            derivativeNoise.derivative = 39.5 * (dn0 + dn1 + dn2 + dn3);
        }
        return derivativeNoise;
    }

    // ===================== Fractal assembly =====================
    fn transformToAvoidAxisAlignment(pos: vec3f) -> vec3f {
        if (u32(u.noiseType) == NOISE_TYPE_SIMPLEX) {
            return ROTATE_OFF_AXIS * pos;
        }
        return pos;
    }
    fn untransformToAvoidAxisAlignment(pos: vec3f) -> vec3f {
        if (u32(u.noiseType) == NOISE_TYPE_SIMPLEX) {
            return transpose(ROTATE_OFF_AXIS) * pos;
        }
        return pos;
    }

    fn getDerivativeNoise1(pos: vec3f, period: vec3f, seed: i32, isDerivativeRequired: bool, isNoiseRequired: bool) -> DerivativeNoise {
        let noiseType = u32(u.noiseType);
        if (noiseType == NOISE_TYPE_VALUE) {
            return valueNoise3DerivativeNoise(pos, period, u.interpolation, seed, isDerivativeRequired, isNoiseRequired);
        } else if (noiseType == NOISE_TYPE_PERLIN) {
            let dn = periodicPerlin3DerivativeNoise(pos, period, seed, isDerivativeRequired, isNoiseRequired || isDerivativeRequired);
            return sharpenDerivativeNoise(dn, u.interpolation, isDerivativeRequired, isNoiseRequired);
        } else {
            let dn = periodicSimplex3DerivativeNoise(pos, period, seed, isDerivativeRequired, isNoiseRequired || isDerivativeRequired);
            return sharpenDerivativeNoise(dn, u.interpolation, isDerivativeRequired, isNoiseRequired);
        }
    }

    fn getDerivativeNoise3(pos: vec3f, period: vec3f, seed: i32, isDerivativeRequired: bool, isNoiseRequired: bool, isRgb: bool) -> DerivativeNoise3 {
        if (u32(u.noiseType) == NOISE_TYPE_VORONOI) {
            return voronoise3DerivativeNoise(pos, period, u.interpolation, VORONOISE_JITTER, seed, isRgb, isDerivativeRequired, isNoiseRequired);
        }
        let dn1 = getDerivativeNoise1(pos, period, seed, isDerivativeRequired, isNoiseRequired);
        var dn = DerivativeNoise3(dn1.derivative, vec3f(dn1.noise));
        if (isRgb) {
            dn.noise.g = getDerivativeNoise1(pos, period, seed + GREEN_SEED_OFFSET, false, isNoiseRequired).noise;
            dn.noise.b = getDerivativeNoise1(pos, period, seed + BLUE_SEED_OFFSET, false, isNoiseRequired).noise;
        }
        return dn;
    }

    fn applyTurbulence(dn: DerivativeNoise3, turbulence: f32, isGradientRequired: bool) -> DerivativeNoise3 {
        var out = dn;
        let t = turbulence - 1.0;
        if (isGradientRequired) {
            let rangeBelowT = -2.0 / (t + 1);
            let rangeAboveT = 2.0 / (1 - t);
            out.derivative = dn.derivative * select(vec3f(rangeBelowT), vec3f(rangeAboveT), dn.noise > vec3f(t));
        }
        out.noise = select(
            map3(dn.noise, -1.0, t, 1.0, -1.0),
            map3(dn.noise, t, 1.0, -1.0, 1.0),
            dn.noise > vec3f(t)
        );
        let foldAmount = clamp(1.0 - abs(t), 0.0, 1.0);
        let noiseType = u32(u.noiseType);
        if (foldAmount > 0.001 && (noiseType == NOISE_TYPE_PERLIN || noiseType == NOISE_TYPE_VORONOI)) {
            let targetGain = select(1.2, 1.25, noiseType == NOISE_TYPE_PERLIN);
            let targetLift = select(0.45, 0.55, noiseType == NOISE_TYPE_PERLIN);
            let gain = mix(1.0, targetGain, foldAmount);
            let lift = mix(0.0, targetLift, foldAmount);
            out.noise = out.noise * gain + vec3f(lift);
            if (isGradientRequired) {
                out.derivative *= gain;
            }
        }
        return out;
    }

    fn fractalNoise(initialPos: vec3f, initialPeriod: vec3f, seed: i32, isRgb: bool, isNoiseRequired_: bool, isGradientRequired_: bool, flow: f32) -> DerivativeNoise3 {
        let harmonicBlendMode = u32(u.harmonicBlendMode);
        let isNoiseRequired = isNoiseRequired_ || harmonicBlendMode != 0u;
        let isGradientRequired = isGradientRequired_ || u.flow > 0.001;
        let isTiled = initialPeriod.x != 0.0 || initialPeriod.y != 0.0;
        let isLooping = initialPeriod.z != 0.0;
        let periodicHarmonicScale = 1.0 / max(round(1.0 / u.harmonicScale), 1.0);
        let harmonicScaleXY = select(u.harmonicScale, periodicHarmonicScale, isTiled);
        let harmonicScaleZ = select(u.harmonicScale, periodicHarmonicScale, isLooping);
        let harmonicScale = vec3(harmonicScaleXY, harmonicScaleXY, harmonicScaleZ);

        var noise = vec3f(0.0, 0.0, 0.0);
        var gradient = vec3f(0.0, 0.0, 0.0);

        var amplitude = 1.0;
        var pos = initialPos;
        var period = initialPeriod;
        var currentSeed = seed;

        let numHarmonics = i32(ceil(u.numHarmonics));
        var amplitudeSum = 0.0;

        var layer0Noise = vec3f(0.0);
        var prevLayerNoise = vec3f(0.0);

        for (var i = 0; i < numHarmonics; i++) {
            let layerFraction = min(1.0, u.numHarmonics - f32(i));
            amplitudeSum += amplitude * layerFraction;

            var derivativeNoise = getDerivativeNoise3(pos, period, currentSeed, isGradientRequired, isNoiseRequired, isRgb);
            if (u.turbulence > 0.001) {
                derivativeNoise = applyTurbulence(derivativeNoise, u.turbulence, isGradientRequired);
            }
            var layerNoise = derivativeNoise.noise;
            var layerGradient = derivativeNoise.derivative;

            if (i == 0) {
                noise = layerNoise;
                layer0Noise = layerNoise;
                gradient = layerGradient;
            } else {
                let layer_amp = amplitude * layerFraction;
                let ln = layer_amp * layerNoise;
                let lg = layer_amp * layerGradient;

                if (harmonicBlendMode == BLEND_ADD) {
                    if (isNoiseRequired) { noise += ln; }
                    if (isGradientRequired) { gradient += lg; }
                } else if (harmonicBlendMode == BLEND_MIN) {
                    let nln = noise + ln;
                    if (isGradientRequired) {
                        gradient = select(gradient, gradient + lg, nln < noise);
                    }
                    noise = min(noise, nln);
                } else if (harmonicBlendMode == BLEND_MAX) {
                    if (isGradientRequired) {
                        gradient = select(gradient, gradient + lg, noise + ln > noise);
                    }
                    noise = max(noise, noise + ln);
                } else if (harmonicBlendMode == BLEND_ADD_ABSOLUTE) {
                    if (isGradientRequired) { gradient += lg * sign(ln); }
                    noise += abs(ln);
                } else if (harmonicBlendMode == BLEND_SUBTRACT_ABSOLUTE) {
                    if (isGradientRequired) { gradient -= lg * sign(ln); }
                    noise -= abs(ln);
                } else if (harmonicBlendMode == BLEND_ADD_MULTIPLIED) {
                    if (isGradientRequired) { gradient += gradient * ln + lg * noise; }
                    noise += noise * ln;
                } else if (harmonicBlendMode == BLEND_EXCLUSION) {
                    if (isGradientRequired) { gradient += lg - 2 * (gradient * ln + lg * noise); }
                    noise += ln - 2 * noise * ln;
                } else if (harmonicBlendMode == BLEND_COARSE_KNOCKOUT) {
                    if (isGradientRequired) { gradient += 0.5 * layer_amp * (layer0Noise + 1) * lg; }
                    noise += layer_amp * ((layerNoise * 0.5 + 0.5) * (layer0Noise + 1) - 1.0);
                } else if (harmonicBlendMode == BLEND_FINE_KNOCKOUT) {
                    if (isGradientRequired) { gradient += 0.5 * layer_amp * (prevLayerNoise + 1) * lg; }
                    noise += layer_amp * ((layerNoise * 0.5 + 0.5) * (prevLayerNoise + 1) - 1.0);
                }
            }

            amplitude *= u.harmonicAmplitude;
            if (amplitude < 0.002) {
                break;
            }

            if (flow > 0.001) {
                pos += gradient * flow;
            }

            if (!isTiled) {
                pos = vec3(rot(u.harmonicRotation) * pos.xy, pos.z);
            }

            pos /= harmonicScale;
            pos.z += 0.5 / f32(i + 1);

            period /= harmonicScale;
            currentSeed += 1;
        }
        return DerivativeNoise3(gradient, noise);
    }

    struct NoisePosCtx {
        pos: vec3f,
        period: vec3f,
        seed: i32,
    };

    fn computePosCtx(localPos: vec2f) -> NoisePosCtx {
        let scale = vec3f(u.scaleX, u.scaleY, 1.0);
        let centerPos = vec2f(u.centerX, u.centerY);
        let rawPosXY = rot(u.angle) * (localPos - centerPos);
        let noiseType = u32(u.noiseType);
        let tileSize = vec2f(u.tileSizeX, u.tileSizeY);
        var xyPeriod = vec2f(0.0);
        if (noiseType != NOISE_TYPE_SIMPLEX) {
            xyPeriod = select(vec2f(0.0), tileSize, tileSize > vec2f(0.0));
        }
        let seed = i32(u.seed);
        let rawPosZ = u.evolution;
        let zPeriod = select(0.0, u.evolutionLoop, u.evolutionLoop > 0.0 && noiseType != NOISE_TYPE_SIMPLEX);

        let initialPeriod = vec3f(xyPeriod.x, xyPeriod.y, zPeriod);
        let untransformedInitialPos = vec3f(rawPosXY, rawPosZ) / scale;
        let initialPos = transformToAvoidAxisAlignment(untransformedInitialPos);
        return NoisePosCtx(initialPos, initialPeriod, seed);
    }

    @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        let dims = max(vec2f(u.width, u.height), vec2f(1.0));
        let localPos = uv * dims;
        let ctx = computePosCtx(localPos);
        let chroma = clamp(u.chroma, 0.0, 1.0);

        let nR = fractalNoise(ctx.pos, ctx.period, ctx.seed, false, true, false, u.flow).noise.x;
        let vR = saturate(nR * 0.5 + 0.5);
        var vG = vR;
        var vB = vR;
        if (chroma > 0.0) {
            let nG = fractalNoise(ctx.pos, ctx.period, ctx.seed + GREEN_SEED_OFFSET, false, true, false, u.flow).noise.x;
            let nB = fractalNoise(ctx.pos, ctx.period, ctx.seed + BLUE_SEED_OFFSET, false, true, false, u.flow).noise.x;
            vG = mix(vR, saturate(nG * 0.5 + 0.5), chroma);
            vB = mix(vR, saturate(nB * 0.5 + 0.5), chroma);
        }
        let color = vec3f(vR, vG, vB);
        return vec4f(color, 1.0);
    }
  `;
    frame.state.shaderModule = device.createShaderModule({ code: WGSL });
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1,
        -1,
        0,
        1,
        1,
        -1,
        1,
        1,
        -1,
        1,
        0,
        0,
        -1,
        1,
        0,
        0,
        1,
        -1,
        1,
        1,
        1,
        1,
        1,
        0,
    ]);
    frame.state.quad.unmap();
    // 24 f32s, 16-byte aligned (see Uniforms struct).
    frame.state.uniformBuf = device.createBuffer({
        size: 24 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}
export function render(device, frame) {
    if (frame.state.pipelineFormat !== frame.output.format) {
        frame.state.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: frame.state.shaderModule,
                entryPoint: 'vs_main',
                buffers: [
                    {
                        arrayStride: 16,
                        attributes: [
                            { shaderLocation: 0, format: 'float32x2', offset: 0 },
                            { shaderLocation: 1, format: 'float32x2', offset: 8 },
                        ],
                    },
                ],
            },
            fragment: {
                module: frame.state.shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: frame.output.format }],
            },
            primitive: { topology: 'triangle-list' },
        });
        frame.state.pipelineFormat = frame.output.format;
    }
    var params = frame.params || {};
    function num(name, fallback) {
        var v = Number(params[name]);
        return Number.isFinite(v) ? v : fallback;
    }
    function pointAngleRadius(name, fallback) {
        var v = params[name] || {};
        var x = Number(v.x);
        var y = Number(v.y);
        var radius = Number(v.radius);
        var angle = Number(v.angle);
        return {
            x: Number.isFinite(x) ? x : fallback.x,
            y: Number.isFinite(y) ? y : fallback.y,
            radius: Number.isFinite(radius) ? radius : fallback.radius,
            angle: Number.isFinite(angle) ? angle : fallback.angle,
        };
    }
    function normalizedPercent(v) {
        return v <= 1 ? v : v / 100;
    }
    var DEG2RAD = Math.PI / 180.0;
    var output = frame.output || {};
    var width = Math.max(1, Number(output.width) || 1);
    var height = Math.max(1, Number(output.height) || 1);
    var FIXED_SEED = 0;
    var FIXED_ASPECT = 1;
    var FIXED_LAYER_ROTATION_DEGREES = 22;
    var mainTransform = pointAngleRadius('transform', { x: 0.5, y: 0.5, radius: 50, angle: 0 });
    var transformRadius = (mainTransform.radius / 100) * Math.min(width, height);
    var phase = num('phase', 0) / 100;
    var cycles = num('cycles', 1);
    device.queue.writeBuffer(frame.state.uniformBuf, 0, new Float32Array([
        width,
        height,
        num('saturation', 0) / 100,
        num('noiseType', 1),
        FIXED_SEED,
        num('turbulence', 0) / 100,
        1 - num('sharpness', 0) / 100,
        normalizedPercent(mainTransform.x) * width,
        normalizedPercent(mainTransform.y) * height,
        transformRadius,
        transformRadius * FIXED_ASPECT,
        mainTransform.angle * DEG2RAD,
        num('tileSizeX', 0),
        num('tileSizeY', 0),
        num('layers', 5),
        num('layerBlend', 0),
        num('layerGain', 50) / 100,
        Math.max(0.001, num('layerScale', 50) / 100),
        FIXED_LAYER_ROTATION_DEGREES * DEG2RAD,
        num('layerFlow', 0) / 100,
        phase * cycles,
        cycles,
        0,
        0,
    ]));
    var bindGroup = device.createBindGroup({
        layout: frame.state.pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: frame.state.uniformBuf } },
        ],
    });
    var encoder = device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: frame.output.createView(),
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: 'store',
            },
        ],
    });
    pass.setPipeline(frame.state.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, frame.state.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
}
defineProperties(Effect, {
    // ----- Noise -----
    noiseType: {
        type: 'number',
        label: 'Noise',
        control: 'select',
        defaultValue: 1,
        options: [
            { value: 0, label: 'Value' },
            { value: 1, label: 'Perlin' },
            { value: 3, label: 'Voronoise' },
        ],
    },
    // ----- Output -----
    saturation: {
        type: 'number',
        label: 'Saturation',
        defaultValue: 0,
        control: 'slider',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
    },
    sharpness: {
        type: 'number',
        label: 'Sharpness',
        description: 'Higher values sharpen or facet the selected noise type',
        defaultValue: 0,
        control: 'slider',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
    },
    turbulence: {
        type: 'number',
        label: 'Turbulence',
        defaultValue: 0,
        control: 'slider',
        min: 0,
        max: 200,
        step: 1,
        unit: '%',
    },
    tileSizeX: {
        type: 'number',
        label: 'Tile size X',
        description: '0 disables tiling on this axis',
        defaultValue: 0,
        control: 'slider',
        min: 0,
        max: 100,
        step: 1,
    },
    tileSizeY: {
        type: 'number',
        label: 'Tile size Y',
        description: '0 disables tiling on this axis',
        defaultValue: 0,
        control: 'slider',
        min: 0,
        max: 100,
        step: 1,
    },
    // ----- Noise Layers -----
    layers: {
        type: 'number',
        label: 'Layers',
        defaultValue: 5,
        control: 'slider',
        min: 1,
        max: 8,
        step: 0.01,
    },
    layerBlend: {
        type: 'number',
        label: 'Layer blend',
        control: 'select',
        defaultValue: 0,
        options: [
            { value: 0, label: 'Add' },
            { value: 1, label: 'Min' },
            { value: 2, label: 'Max' },
            { value: 3, label: 'Add absolute' },
            { value: 4, label: 'Subtract absolute' },
            { value: 5, label: 'Add multiplied' },
            { value: 6, label: 'Exclusion' },
            { value: 7, label: 'Coarse knockout' },
            { value: 8, label: 'Fine knockout' },
        ],
    },
    layerGain: {
        type: 'number',
        label: 'Layer gain',
        defaultValue: 50,
        control: 'slider',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
    },
    layerScale: {
        type: 'number',
        label: 'Layer scale',
        defaultValue: 50,
        control: 'slider',
        min: 1,
        max: 100,
        step: 1,
        unit: '%',
    },
    layerFlow: {
        type: 'number',
        label: 'Layer flow',
        defaultValue: 0,
        control: 'slider',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
    },
    // ----- Transform -----
    transform: {
        type: 'point-angle-radius',
        label: 'Transform',
        defaultValue: { x: 50, y: 50, radius: 50, angle: 0 },
        mode: 'canvas_and_ui',
        positionUnit: '%',
        radiusUnit: '%',
        minRadius: 1,
        maxRadius: 100,
    },
    // ----- Keyframe Evolution -----
    phase: {
        type: 'number',
        label: 'Phase',
        description: 'Manual phase through the loop, as a percentage',
        defaultValue: 0,
        control: 'slider',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
    },
    cycles: {
        type: 'number',
        label: 'Cycles',
        description: 'Shader time covered by one full phase cycle',
        defaultValue: 1,
        control: 'slider',
        min: 1,
        max: 20,
        step: 1,
    },
});

export const manifest = {
  "name": "Fractal noise",
  "version": 2,
  "isAnimated": false,
  "usesMouse": false
}
