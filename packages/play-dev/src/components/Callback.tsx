import { useEffect, useState } from "preact/hooks";
import { completeSignIn } from "../auth/Callback.ts";

type State = { kind: "pending" } | { kind: "error"; message: string };

export function CallbackScreen() {
  const [state, setState] = useState<State>({ kind: "pending" });

  useEffect(() => {
    completeSignIn().then(result => {
      if (result.ok) {
        history.replaceState(null, "", "/");
        location.reload();
      } else {
        setState({ kind: "error", message: result.error });
      }
    });
  }, []);

  if (state.kind === "pending") {
    return <div class="callback">Signing you in...</div>;
  }
  return (
    <div class="callback callback-error">
      <p>{state.message}</p>
      <a href="/">Return to editor</a>
    </div>
  );
}
