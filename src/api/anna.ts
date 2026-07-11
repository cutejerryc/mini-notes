/**
 * Anna Runtime connection wrapper.
 *
 * Connects to the Anna Host via AnnaAppRuntime.connect() and returns
 * the `anna` object through which all Host API calls (storage, tools, etc.)
 * are made.
 */

let _anna: Anna | null = null;
let _connected = false;

export async function connectAnna(): Promise<Anna> {
  if (_connected && _anna) return _anna;

  if (typeof window.AnnaAppRuntime === "undefined") {
    throw new Error(
      "AnnaAppRuntime not found. This app must run inside an Anna App harness."
    );
  }

  const { anna } = await window.AnnaAppRuntime.connect();
  _anna = anna;
  _connected = true;
  return anna;
}

export function getAnna(): Anna {
  if (!_anna) throw new Error("Not connected to Anna Runtime. Call connectAnna() first.");
  return _anna;
}
