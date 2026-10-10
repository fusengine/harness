import { expect, test } from "bun:test";
import { detachedProcessViolation } from "../src/policy/motion/guard-detach";

test("D3 visible detach operators and utilities are refused without executing them", () => {
  for (const command of ["nohup bash render.sh", "/usr/bin/setsid render.sh", "disown", "at now", "batch", "launchctl submit -p render.sh", "bash render.sh &", "(bash render.sh &)", "sh -c 'bash render.sh &'", "bash -c 'nohup render.sh'", "true; setsid render.sh", "env X=1 nohup render.sh", "command nohup render.sh", "env -u X nohup render.sh", "env bash -c 'render.sh &'", "( nohup render.sh )"]) {
    expect(detachedProcessViolation(command)?.kind).toBe("block");
  }
});

test("D3 foreground chaining, redirects, quoted and escaped text remain allowed", () => {
  for (const command of ["bash render.sh && ls", "ls 2>&1", "ls &>out.txt", "ls &>>out.txt", "ls >&out.txt", "echo '&'", 'echo "nohup setsid disown at batch launchctl &"', "echo \\&", "printf '%s' 'bash render.sh &'", "sh -c 'echo \"&\"'", "echo nohup", "echo setsid", "ls # background &", "command -v nohup"]) {
    expect(detachedProcessViolation(command)).toBeNull();
  }
});

test("D3 visible conditional and loop bodies cannot hide detach utilities", () => {
  for (const command of ["if true; then nohup bash render.sh; fi", "if nohup render.sh; then :; fi", "if false; then :; elif setsid render.sh; then :; else batch; fi", "while true; do launchctl submit -p render.sh; done", "until false; do disown; done", "! at now", "if true; then env nohup render.sh; fi", "sh -c 'if true; then nohup render.sh; fi'"]) expect(detachedProcessViolation(command)?.kind).toBe("block");
  for (const command of ["if true; then echo nohup; fi", "echo 'then nohup render.sh'", "printf '%s' 'if true; then nohup render.sh; fi'", "\\then nohup render.sh", "'then' nohup render.sh", "if true; then ls 2>&1 && echo '&'; fi"]) expect(detachedProcessViolation(command)).toBeNull();
});

test("D3 timed commands and visible case-arm command positions remain guarded", () => {
  for (const command of ["time nohup bash render.sh --stage stills", "time -p setsid render.sh", "if true; then time nohup render.sh; fi", "case x in x) nohup bash render.sh ;; esac", "case x in y) echo ok;; x) setsid render.sh;; esac", "case x in x|y) batch;; esac", 'case "x y" in "x y") disown;; esac', "sh -c 'case x in x) nohup render.sh;; esac'"]) expect(detachedProcessViolation(command)?.kind).toBe("block");
  for (const command of ["time echo nohup", "time -p ls 2>&1", "echo 'time nohup render.sh'", "printf '%s' 'case x in x) nohup render.sh;; esac'", "case x in x) echo nohup;; esac", 'case x in x) echo "x) nohup";; esac', "case x in nohup) echo ok;; esac", "case x in x) ls &>log && echo '&';; esac"]) expect(detachedProcessViolation(command)).toBeNull();
});

test("D3 case-arm spacing and nested case bodies retain command positions", () => {
  for (const command of ["case x in x ) nohup render.sh;; esac", "case x in x) case y in y) setsid render.sh;; esac;; esac", "case x in (x) time nohup render.sh;; esac"]) expect(detachedProcessViolation(command)?.kind).toBe("block");
  for (const command of ["case x in x ) echo nohup;; esac", "case x in x) case y in y) echo setsid;; esac;; esac"]) expect(detachedProcessViolation(command)).toBeNull();
});

test("D3 pipe-stderr and case fall-through operators are not detach forms", () => {
  for (const command of ["ffmpeg -i a.mp4 -f null - |& tail -5", "case x in x) echo a ;& y) echo b ;; esac", "case x in x) echo a ;;& *) echo b ;; esac"]) expect(detachedProcessViolation(command)).toBeNull();
  for (const command of ["ls |& cat &", "case x in x) echo a ;& y) nohup render.sh ;; esac", "case x in x) echo a ;;& *) nohup ls & ;; esac"]) expect(detachedProcessViolation(command)?.kind).toBe("block");
});

test("D3 case headers retain state across newlines and comments", () => {
  for (const command of ["case x\nin\nx) nohup render.sh;;\nesac", "case x in\nx) setsid render.sh;;\nesac", "case x # selector comment\nin # keyword comment\nx) batch;;\nesac", "case 'x y'\n# header comment ; 'ignored'\nin\n'x y' ) disown;;\nesac", "case x\nin\nx) case y\nin\ny) launchctl submit -p render.sh;; esac;; esac"]) expect(detachedProcessViolation(command)?.kind).toBe("block");
  for (const command of ["case x\nin\nx) echo nohup;;\nesac", "case x # comment\nin\nx) echo batch;;\nesac", "printf '%s' 'case x\nin\nx) nohup render.sh;;\nesac'", "echo ok # case x; nohup render.sh", "echo ok # ' ; setsid render.sh\necho done"]) expect(detachedProcessViolation(command)).toBeNull();
});
