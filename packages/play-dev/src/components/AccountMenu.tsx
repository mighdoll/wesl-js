import { useEffect, useRef, useState } from "preact/hooks";
import { startSignIn } from "../auth/Authorize.ts";
import { signOut } from "../auth/Revoke.ts";
import type { AuthToken } from "../auth/Token.ts";

interface Props {
  token: AuthToken | null;
  onSignOut(): void;
}

export function AccountMenu({ token, onSignOut }: Props) {
  if (!token) {
    return (
      <button type="button" class="signin-btn" onClick={startSignIn}>
        Sign in
      </button>
    );
  }
  return <SignedIn token={token} onSignOut={onSignOut} />;
}

function SignedIn({
  token,
  onSignOut,
}: {
  token: AuthToken;
  onSignOut(): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function handleSignOut() {
    signOut();
    setOpen(false);
    onSignOut();
  }

  return (
    <div class="account-menu" ref={ref}>
      <button
        type="button"
        class="avatar-btn"
        aria-label={`Signed in as ${token.login}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <img src={token.avatarUrl} alt="" />
      </button>
      {open && (
        <div class="account-dropdown" role="menu">
          <div class="account-login">{token.login}</div>
          <button type="button" role="menuitem" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
