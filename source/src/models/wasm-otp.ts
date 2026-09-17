// Loader for crypto/otp.wasm — the C++ (fast_io) implementation of OTP
// generation compiled to wasm32-wasip1, following the WasmPass pattern:
// instantiateStreaming + WASI stubs + __wasm_call_ctors at startup, then
// otpGenerate() is synchronous.

interface OtpExports {
  memory: WebAssembly.Memory;
  __wasm_call_ctors(): void;
  otp_input(): number;
  otp_output(): number;
  otp_generate(
    type: number,
    secretLen: number,
    counter: bigint,
    digits: number,
    algorithm: number
  ): number;
}

let exports_: OtpExports | null = null;

// The module is built with -nostartfiles and needs no WASI imports today, but
// provide the standard stubs anyway so fast_io features that pull them in
// (rng, clocks) keep working if the C++ side grows.
const wasiStubs = {
  proc_exit: (code: number) => {
    throw new WebAssembly.RuntimeError("otp.wasm exited with code " + code);
  },
  random_get: (bufPtr: number, bufLen: number) => {
    if (!exports_) {
      return 1;
    }
    crypto.getRandomValues(
      new Uint8Array(exports_.memory.buffer, bufPtr, bufLen)
    );
    return 0;
  },
  clock_time_get: (clockId: number, _precision: number, resultPtr: number) => {
    if (!exports_) {
      return 1;
    }
    const ns =
      clockId === 0
        ? BigInt(Date.now()) * BigInt(1_000_000)
        : BigInt(Math.floor(performance.now() * 1_000_000));
    new DataView(exports_.memory.buffer).setBigUint64(resultPtr, ns, true);
    return 0;
  },
  args_get: () => 0,
  args_sizes_get: (argcPtr: number, argvBufSizePtr: number) => {
    if (!exports_) {
      return 1;
    }
    const view = new DataView(exports_.memory.buffer);
    view.setUint32(argcPtr, 0, true);
    view.setUint32(argvBufSizePtr, 0, true);
    return 0;
  },
  environ_get: () => 0,
  environ_sizes_get: (countPtr: number, bufSizePtr: number) => {
    if (!exports_) {
      return 1;
    }
    const view = new DataView(exports_.memory.buffer);
    view.setUint32(countPtr, 0, true);
    view.setUint32(bufSizePtr, 0, true);
    return 0;
  },
  fd_write: () => 0,
  fd_read: () => 0,
  fd_close: () => 0,
  fd_seek: () => 0,
};

export async function initOtpWasm(): Promise<void> {
  const res = await fetch("/wasm/otp.wasm");
  if (!res.ok) {
    throw new Error("Failed to fetch otp.wasm: " + res.status);
  }
  const importObject = { wasi_snapshot_preview1: wasiStubs };
  let instance: WebAssembly.Instance;
  if (typeof WebAssembly.instantiateStreaming === "function") {
    try {
      instance = (
        await WebAssembly.instantiateStreaming(
          Promise.resolve(res),
          importObject
        )
      ).instance;
    } catch {
      // instantiateStreaming requires the application/wasm MIME type;
      // fall back to a buffered instantiate for dev servers without it.
      instance = (
        await WebAssembly.instantiate(await res.arrayBuffer(), importObject)
      ).instance;
    }
  } else {
    instance = (
      await WebAssembly.instantiate(await res.arrayBuffer(), importObject)
    ).instance;
  }
  exports_ = instance.exports as unknown as OtpExports;
  // Run global/static constructors before any other export is called.
  exports_.__wasm_call_ctors();
}

export function isOtpWasmReady(): boolean {
  return exports_ !== null;
}

// Mirrors KeyUtilities.generate semantics for SHA-1/SHA-256/SHA-512 paths.
// Throws on invalid input via the same error messages as the JS code.
export function otpGenerate(
  type: number,
  secret: string,
  counter: number,
  digits: number,
  algorithm: number
): string {
  if (!exports_) {
    throw new Error("otp wasm module not initialized");
  }
  const input = new Uint8Array(
    exports_.memory.buffer,
    exports_.otp_input(),
    secret.length
  );
  for (let i = 0; i < secret.length; i++) {
    input[i] = secret.charCodeAt(i) & 0xff;
  }
  const len = exports_.otp_generate(
    type,
    secret.length,
    BigInt(Math.trunc(counter)),
    digits,
    algorithm
  );
  if (len === -1) {
    throw new Error("Invalid Base32 string");
  }
  if (len < 0) {
    throw new Error("Invalid secret key");
  }
  return new TextDecoder("ascii").decode(
    new Uint8Array(exports_.memory.buffer, exports_.otp_output(), len)
  );
}
