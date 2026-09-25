// ─────────────────────────────────────────────────────────────
// 档案层（React 适配）：useStore
// 持有 DomainState，派发动作必须经过引擎；自动持久化到 localStorage。
// 页面层只与本文件交互，不直接改状态。
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DomainState } from "../domain/types";
import { Action, DomainError, impactCount, step } from "./engine";
import { createInitialState } from "./seed";

const STORAGE_KEY = "sample-confirmation-state-v1";

function load(): DomainState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DomainState;
  } catch {
    // 落档损坏时回到引导场景
  }
  return createInitialState();
}

function nowIso() {
  return new Date().toISOString();
}

export interface DispatchOptions {
  at?: string;
}

export function useStore() {
  const [state, setState] = useState<DomainState>(load);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时仅保留内存态
    }
  }, [state]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3200);
  }, []);

  const dispatch = useCallback(
    (action: Action, options: DispatchOptions = {}): boolean => {
      try {
        const withTime: Action =
          "at" in action
            ? action
            : ({ ...(action as object), at: options.at ?? nowIso() } as Action);
        setState((prev) => step(prev, withTime));
        setError(null);
        return true;
      } catch (e) {
        if (e instanceof DomainError) {
          setError(e.message);
          return false;
        }
        throw e;
      }
    },
    []
  );

  const resetDemo = useCallback(() => {
    setState(createInitialState());
    setError(null);
    showFlash("已重置为演示数据");
  }, [showFlash]);

  const clearStorage = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const helpers = useMemo(
    () => ({
      impactCount: (kind: "recipe" | "colorCard" | "budget", id: string) =>
        impactCount(state, kind, id),
    }),
    [state]
  );

  return {
    state,
    error,
    flash,
    dispatch,
    resetDemo,
    clearStorage,
    showFlash,
    ...helpers,
  };
}

export type Store = ReturnType<typeof useStore>;
