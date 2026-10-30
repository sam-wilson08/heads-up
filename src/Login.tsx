import { type SyntheticEvent, useState } from "react";
import {
  NAME_LIMITS,
  nameProblem,
  OnlineError,
  saveSession,
  type Session,
  signIn,
  tokenFor,
} from "./online";
import "./online.css";
import { TitleBall } from "./ui/Ball";
import { SerieAMark } from "./ui/TeamPicker";

/**
 * Signing in: just a username, no email or password. A free name is yours from then on, on this
 * device. Anyone can still play as a guest, off the leaderboard, as they can when it's offline.
 * It's kept to the title, a line, the name and the way in, so there's little to take in.
 */
export const Login = ({
  onSignedIn,
  onGuest,
}: {
  onSignedIn: (session: Session) => void;
  onGuest: () => void;
}) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const problem = nameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      // A name this device has had before signs back in with its token.
      const session = await signIn(name, tokenFor(name));
      saveSession(session);
      onSignedIn(session);
    } catch (thrown) {
      setError(thrown instanceof OnlineError ? thrown.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <main className="screen title login">
      <div className="title-top">
        <SerieAMark className="league-mark title-league" />
        <div className="title-ball" aria-hidden="true">
          <TitleBall />
        </div>
        <h1>
          Heads
          <br />
          <span>Up</span>
        </h1>
        <p className="tagline">Pick a name for the leaderboard. No email, no password.</p>
      </div>
      <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
        <input
          id="username"
          value={name}
          maxLength={NAME_LIMITS.max}
          autoComplete="nickname"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Your name"
          aria-label="Username"
          aria-invalid={error !== undefined}
          aria-describedby={error ? "login-help" : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
        {error && (
          <p className="login-error" role="alert" id="login-help">
            {error}
          </p>
        )}
        <button type="submit" className="button play-button" disabled={busy}>
          {busy ? "Signing in…" : "Let's go ▶"}
        </button>
      </form>
      <button type="button" className="text-button login-guest" onClick={onGuest}>
        Play as a guest
      </button>
    </main>
  );
};
