"use client";

import { Turnstile, type TurnstileInstance, type TurnstileTheme } from "@marsidev/react-turnstile";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type TurnstileChallengeHandle = {
  reset: () => void;
};

type Props = {
  siteKey: string;
  action: "login" | "register" | "recovery";
  onTokenChange: (token: string | null) => void;
  onUnavailable?: () => void;
};

function currentTheme(): TurnstileTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, Props>(function TurnstileChallenge({
  siteKey,
  action,
  onTokenChange,
  onUnavailable,
}, forwardedRef) {
  const widgetRef = useRef<TurnstileInstance | undefined>(undefined);
  const [theme, setTheme] = useState<TurnstileTheme>(currentTheme);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onTokenChange(null);
  }, [onTokenChange, theme]);

  useImperativeHandle(forwardedRef, () => ({
    reset() {
      widgetRef.current?.reset();
      onTokenChange(null);
    },
  }), [onTokenChange]);

  if (!siteKey) {
    return <div className="turnstile-unavailable" role="alert">Security check is temporarily unavailable.</div>;
  }

  return (
    <div className="turnstile-shell">
      <span>Security check</span>
      <Turnstile
        key={`${action}-${theme}`}
        ref={widgetRef}
        siteKey={siteKey}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={() => onTokenChange(null)}
        onError={() => {
          onTokenChange(null);
          onUnavailable?.();
        }}
        options={{
          action,
          theme,
          size: "flexible",
          refreshExpired: "auto",
          refreshTimeout: "auto",
          retry: "auto",
        }}
      />
      <small>Protected by Cloudflare Turnstile</small>
    </div>
  );
});

export default TurnstileChallenge;
