import { useEffect, useState } from "react";
import {
  MeshNameInput,
  QRExchange,
  makeScanPayload,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Profile = { name: string; teach: string[]; learn: string[] };

const KEY = (p: string, k: string) => `${p}:skill:${k}`;

const parseTags = (s: string) =>
  s
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

// Deterministic, order-independent key for a pair of peers so both sides
// read/write the SAME "connected via QR" flag regardless of who scanned.
const pairKey = (p1: string, p2: string) => (p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`);

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="viral-screen">
        <h1>skill swap</h1>
        <p className="viral-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(KEY(config.storagePrefix, "name")) ?? "",
  );
  const [teach, setTeach] = useState(
    () => localStorage.getItem(KEY(config.storagePrefix, "teach")) ?? "",
  );
  const [learn, setLearn] = useState(
    () => localStorage.getItem(KEY(config.storagePrefix, "learn")) ?? "",
  );
  const [, rerender] = useState(0);

  useEffect(
    () => localStorage.setItem(KEY(config.storagePrefix, "name"), name),
    [name, config.storagePrefix],
  );
  useEffect(
    () => localStorage.setItem(KEY(config.storagePrefix, "teach"), teach),
    [teach, config.storagePrefix],
  );
  useEffect(
    () => localStorage.setItem(KEY(config.storagePrefix, "learn"), learn),
    [learn, config.storagePrefix],
  );

  useEffect(() => {
    const m = room.doc.getMap<Profile>("profiles");
    const c = room.doc.getMap<boolean>("connected");
    const cb = () => rerender((n) => n + 1);
    m.observe(cb);
    c.observe(cb);
    return () => {
      m.unobserve(cb);
      c.unobserve(cb);
    };
  }, [room]);

  const profiles = room.doc.getMap<Profile>("profiles");
  // `connected` records pairs of peers who actually met by scanning each
  // other's QR — the "via QR" half of the advertised feature. It is shared
  // state, so the connection surfaces on BOTH peers' screens.
  const connected = room.doc.getMap<boolean>("connected");

  useEffect(() => {
    if (name.trim()) {
      profiles.set(room.peerId, {
        name: name.trim(),
        teach: parseTags(teach),
        learn: parseTags(learn),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, teach, learn, room.peerId]);

  const my = profiles.get(room.peerId) ?? { name: "", teach: [], learn: [] };

  // Connect with a peer I scanned: record the pair in shared state so both
  // sides see "connected via QR". Only meaningful for an actual other peer.
  const connectViaQR = (otherId: string) => {
    if (!otherId || otherId === room.peerId) return;
    if (!profiles.has(otherId)) return;
    connected.set(pairKey(room.peerId, otherId), true);
  };

  // matches: people whose teach overlaps my learn, AND vice versa
  const profileList: Array<Profile & { peerId: string }> = [];
  profiles.forEach((v, k) => {
    if (k !== room.peerId) profileList.push({ ...v, peerId: k });
  });

  const matches = profileList
    .map((p) => {
      const theyTeachMeWant = p.teach.filter((t) => my.learn.includes(t));
      const iTeachThemWant = my.teach.filter((t) => p.learn.includes(t));
      return {
        ...p,
        theyTeachMeWant,
        iTeachThemWant,
        mutualScore: theyTeachMeWant.length * iTeachThemWant.length,
        connected: connected.get(pairKey(room.peerId, p.peerId)) === true,
      };
    })
    .filter((m) => m.theyTeachMeWant.length + m.iTeachThemWant.length > 0)
    .sort((a, b) => b.mutualScore - a.mutualScore);

  const myPayload = makeScanPayload(room.roomId, room.peerId, name.trim() || "anon");

  return (
    <div className="viral-screen">
      <header>
        <h1>skill swap</h1>
        <p className="viral-status">
          {profiles.size} profiles · {matches.length} possible matches for you
        </p>
      </header>

      <section>
        <h2 className="viral-section-title">your profile</h2>
        <MeshNameInput
          className="viral-name"
          value={name}
          onChange={setName}
          placeholder="your name"
          maxLength={48}
        />
        <textarea
          className="ss-area"
          value={teach}
          onChange={(e) => setTeach(e.target.value)}
          placeholder="i can teach (comma-separated)"
          rows={2}
        />
        <textarea
          className="ss-area"
          value={learn}
          onChange={(e) => setLearn(e.target.value)}
          placeholder="i want to learn (comma-separated)"
          rows={2}
        />
      </section>

      <QRExchange
        myPayload={myPayload}
        showLabel="your QR — show to connect"
        scanLabel="scan someone to connect via QR"
        onScan={(parsed) => connectViaQR(parsed.peerId)}
      />

      <section>
        <h2 className="viral-section-title">matches</h2>
        {matches.length === 0 ? (
          <p className="viral-empty">no matches yet — get more people in the room</p>
        ) : (
          <ul className="ss-matches">
            {matches.map((m) => (
              <li
                key={m.peerId}
                className={`viral-card${m.connected ? " ss-connected" : ""}`}
                data-peer={m.peerId}
              >
                <strong>{m.name}</strong>
                {m.theyTeachMeWant.length > 0 && (
                  <p>
                    can teach you: <em>{m.theyTeachMeWant.join(", ")}</em>
                  </p>
                )}
                {m.iTeachThemWant.length > 0 && (
                  <p>
                    you can teach: <em>{m.iTeachThemWant.join(", ")}</em>
                  </p>
                )}
                {m.mutualScore > 0 && <span className="ss-mutual">✓ mutual swap available</span>}
                {m.connected ? (
                  <span className="ss-qr-status">✓ connected via QR</span>
                ) : (
                  <button
                    type="button"
                    className="viral-ghost ss-connect"
                    onClick={() => connectViaQR(m.peerId)}
                  >
                    connect via QR
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
