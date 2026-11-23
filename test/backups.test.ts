import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BackupWatcher } from "../src/backup-watch.js";
import { assessBackups, BackupsUnavailableError, listBackups, type BackupFile } from "../src/core/backups.js";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-23T12:00:00Z");
const file = (name: string, size: number, hoursAgo: number): BackupFile => ({
  name,
  size,
  mtime: new Date(NOW.getTime() - hoursAgo * HOUR),
});

async function backupDir(files: [string, number, number][]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "skald-backups-"));
  for (const [name, size, hoursAgo] of files) {
    const p = path.join(dir, name);
    await writeFile(p, Buffer.alloc(size));
    const t = new Date(NOW.getTime() - hoursAgo * HOUR);
    await utimes(p, t, t);
  }
  return dir;
}

describe("listBackups", () => {
  it("lista solo copias, de la más reciente a la más antigua (ignora el lock)", async () => {
    const dir = await backupDir([
      ["world-20261121-043000.tar.gz", 10, 31],
      ["world-20261122-043001.tar.gz", 12, 7],
      [".mc-backup-lock", 0, 100],
      ["notas.txt", 5, 1],
    ]);
    expect((await listBackups(dir)).map((f) => f.name)).toEqual([
      "world-20261122-043001.tar.gz",
      "world-20261121-043000.tar.gz",
    ]);
  });

  it("carpeta inexistente → error claro", async () => {
    await expect(listBackups("/no/existe")).rejects.toBeInstanceOf(BackupsUnavailableError);
  });
});

describe("assessBackups", () => {
  const max = 26 * HOUR;

  it("ok con una copia reciente", () => {
    const h = assessBackups([file("b", 870, 7), file("a", 870, 31)], NOW, max);
    expect(h).toMatchObject({ status: "ok", count: 2, totalSize: 1740 });
  });

  it("sin copias", () => {
    expect(assessBackups([], NOW, max).status).toBe("none");
  });

  it("copia demasiado antigua", () => {
    expect(assessBackups([file("a", 870, 30)], NOW, max).status).toBe("stale");
  });

  it("copia que pesa menos de la mitad que la anterior", () => {
    expect(assessBackups([file("b", 300, 2), file("a", 870, 26)], NOW, max).status).toBe("small");
  });

  it("no juzga el tamaño de una copia que aún se está escribiendo", () => {
    expect(assessBackups([file("b", 300, 0.05), file("a", 870, 24)], NOW, max).status).toBe("ok");
  });
});

describe("BackupWatcher", () => {
  it("al arrancar con todo bien no dice nada; avisa al fallar y al recuperarse, una sola vez", async () => {
    const dir = await backupDir([["world-20261123-043000.tar.gz", 100, 7]]);
    const send = vi.fn<(message: string, ok: boolean) => Promise<void>>().mockResolvedValue(undefined);
    const watcher = new BackupWatcher(dir, 26, send);

    await watcher.check(NOW);
    expect(send).not.toHaveBeenCalled();

    // 20 h después sin copia nueva: 27 h → aviso (una sola vez aunque se compruebe más).
    await watcher.check(new Date(NOW.getTime() + 20 * HOUR));
    await watcher.check(new Date(NOW.getTime() + 21 * HOUR));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toContain("Muninn no ha vuelto");
    expect(send.mock.calls[0]?.[1]).toBe(false);

    // Llega una copia nueva → aviso de recuperación.
    const t = new Date(NOW.getTime() + 21 * HOUR);
    const p = path.join(dir, "world-20261124-043000.tar.gz");
    await writeFile(p, Buffer.alloc(100));
    await utimes(p, t, t);
    await watcher.check(new Date(t.getTime() + HOUR));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toContain("Muninn ha vuelto");
    expect(send.mock.calls[1]?.[1]).toBe(true);
  });

  it("avisa si no puede leer la carpeta", async () => {
    const send = vi.fn<(message: string, ok: boolean) => Promise<void>>().mockResolvedValue(undefined);
    await new BackupWatcher("/no/existe", 26, send).check(NOW);
    expect(send.mock.calls[0]?.[0]).toContain("No puedo leer la carpeta de copias");
  });
});
