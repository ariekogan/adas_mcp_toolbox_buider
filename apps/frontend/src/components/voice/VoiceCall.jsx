import React, { useState, useRef, useCallback, useEffect } from "react";
import voiceFetch from "../../api/voiceFetch.js";
import { postTurn } from "../../api/voiceApi.js";

/* ─── Styles ─── */
const btnStyle = (variant, disabled) => ({
  padding: "10px 22px", borderRadius: 8, border: "none", cursor: disabled ? "default" : "pointer",
  fontSize: 14, fontWeight: 700, marginRight: 10,
  background: variant === "start" ? "#16a34a" : variant === "stop" ? "#dc2626" : "#334155",
  color: "#fff", opacity: disabled ? 0.5 : 1, transition: "all 0.15s",
});

const statusDot = (connected) => ({
  display: "inline-block", width: 10, height: 10, borderRadius: "50%",
  background: connected ? "#4ade80" : "#64748b", marginRight: 8,
  boxShadow: connected ? "0 0 6px #4ade80" : "none",
});

const panelBox = {
  background: "#141c27", border: "1px solid #1e293b", borderRadius: 8,
  padding: 16, overflow: "auto",
};

const sectionTitle = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
  color: "#64748b", marginBottom: 8,
};

export default function VoiceCall() {
  const [state, setState] = useState("idle");
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);      // session response (instructions, skills, etc)
  const [transcript, setTranscript] = useState([]);            // {role, text, ts}
  const [aiPartial, setAiPartial] = useState("");              // streaming AI text
  const [userPartial, setUserPartial] = useState("");          // streaming user text
  const [toolCalls, setToolCalls] = useState([]);              // active tool calls {callId, name, status}
  const [splitPos, setSplitPos] = useState(60);                // % for upper/lower splitter on left panel

  const pcRef = useRef(null);
  const dcRef = useRef(null);        // data channel ref
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef(null); // stable ref for use in event handler closures
  const transcriptEndRef = useRef(null);
  const turnDebounceRef = useRef(null); // debounce timer for turn-triggered refreshes

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, aiPartial, userPartial]);

  /* ─── Send session.update to OpenAI via data channel (instructions only) ─── */
  const sendSessionUpdate = useCallback((instructions) => {
    if (!instructions) return;
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify({
      type: "session.update",
      session: { instructions },
    }));
    // Update left panel with fresh instructions
    setSessionMeta(prev => prev ? { ...prev, instructions } : prev);
    console.log("session.update sent (instructions refreshed)");
  }, []);

  /* ─── Post a transcript turn to backend and refresh instructions (debounced) ─── */
  const sendTurnAndRefresh = useCallback((role, text) => {
    const sid = sessionIdRef.current;
    if (!sid || !text) return;
    // Debounce: rapid turns (e.g., user + AI back-to-back) get batched into one refresh
    if (turnDebounceRef.current) clearTimeout(turnDebounceRef.current);
    turnDebounceRef.current = setTimeout(async () => {
      try {
        const json = await postTurn(sid, { role, text });
        if (json.ok && json.instructions) {
          sendSessionUpdate(json.instructions);
        }
      } catch (e) {
        console.warn("Failed to post turn:", e.message);
      }
    }, 1000);
  }, [sendSessionUpdate]);

  /* ─── Start Call ─── */
  const startCall = useCallback(async () => {
    // Kill any existing connection first (prevents multiple parallel calls)
    if (dcRef.current) { try { dcRef.current.close(); } catch {} dcRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioRef.current) { audioRef.current.srcObject = null; }

    setState("connecting");
    setError(null);
    setTranscript([]);
    setAiPartial("");
    setUserPartial("");

    try {
      // 1. Create voice session (tenant injected via X-ADAS-TENANT header)
      const sessRes = await voiceFetch("voice-conversation/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const sessJson = await sessRes.json();
      if (!sessJson.ok) throw new Error(sessJson.error || "Failed to create session");
      if (!sessJson.has_key) throw new Error("OPENAI_API_KEY not configured on voice-backend");

      const sid = sessJson.session_id;
      setSessionId(sid);
      sessionIdRef.current = sid;
      setSessionMeta(sessJson);

      // 2. Get microphone access (requires HTTPS / secure context)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          window.isSecureContext
            ? "Microphone access not available in this browser"
            : "Microphone requires HTTPS. Open this page via the ngrok HTTPS URL instead of http://"
        );
      }
      // 3. Create RTCPeerConnection (same pattern as DemoX)
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Handle remote audio
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0];
      };

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === "disconnected" || s === "failed" || s === "closed") {
          setState("idle");
        }
      };

      // 4. Create data channel BEFORE adding tracks / creating offer
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("Data channel open — sending session.update");
        // Configure session: English, voice, transcription, tools
        const sessionConfig = {
          instructions: sessJson.instructions || "You are A-Team, an agent team builder assistant. Always respond in English.",
          voice: sessJson.voice || "alloy",
          modalities: ["audio", "text"],
          input_audio_transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
          turn_detection: { type: "server_vad", create_response: true },
        };

        // Add tools if backend provided them
        if (sessJson.tools && sessJson.tools.length > 0) {
          sessionConfig.tools = sessJson.tools;
          sessionConfig.tool_choice = "auto";
          console.log(`Sending ${sessJson.tools.length} tools to OpenAI Realtime`);
        }

        dc.send(JSON.stringify({
          type: "session.update",
          session: sessionConfig,
        }));
      };

      dc.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          handleRealtimeEvent(evt);
        } catch {}
      };

      // 5. Get microphone with echo cancellation (same as DemoX)
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = localStream;
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // 6. Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 7. Send offer to voice-backend (backend proxies to OpenAI)
      const offerRes = await voiceFetch(`voice-conversation/${sid}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });

      if (!offerRes.ok) {
        const errText = await offerRes.text();
        throw new Error(`SDP offer failed: ${errText}`);
      }

      const answerSdp = await offerRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setState("connected");
    } catch (e) {
      console.error("VoiceCall error:", e);
      setError(e.message);
      setState("error");
      cleanup();
    }
  }, []);

  /* ─── Handle OpenAI Realtime events from data channel ─── */
  const handleRealtimeEvent = useCallback((evt) => {
    switch (evt.type) {
      // AI response transcript (streaming)
      case "response.audio_transcript.delta":
        setAiPartial(p => p + (evt.delta || ""));
        break;
      case "response.audio_transcript.done":
        setTranscript(prev => [...prev, { role: "ai", text: evt.transcript || "", ts: Date.now() }]);
        setAiPartial("");
        // Post AI turn to backend → refresh instructions
        sendTurnAndRefresh("assistant", evt.transcript);
        break;

      // User speech transcript
      case "conversation.item.input_audio_transcription.delta":
        setUserPartial(p => p + (evt.delta || ""));
        break;
      case "conversation.item.input_audio_transcription.completed":
        setTranscript(prev => [...prev, { role: "user", text: evt.transcript || "", ts: Date.now() }]);
        setUserPartial("");
        // Post user turn to backend → refresh instructions
        sendTurnAndRefresh("user", evt.transcript);
        break;

      // Speech activity indicators
      case "input_audio_buffer.speech_started":
        setUserPartial("");
        break;
      case "input_audio_buffer.speech_stopped":
        break;

      // ── Function call handling (tool invocation) ──
      case "response.function_call_arguments.done": {
        const callId = evt.call_id;
        const fnName = evt.name;
        const fnArgs = evt.arguments;
        console.log(`Function call: ${fnName} (call_id=${callId})`);

        // Parse args to show which skill is being called
        let parsedArgs;
        try { parsedArgs = JSON.parse(fnArgs || "{}"); } catch { parsedArgs = {}; }
        const isStateUpdate = fnName === "update_conversation_state";
        const skillLabel = isStateUpdate ? `state:${parsedArgs.operation || "update"}` : (parsedArgs.skill_name || fnName);
        const msgPreview = isStateUpdate
          ? (parsedArgs.note || parsedArgs.key || parsedArgs.topic || "")
          : (parsedArgs.message ? `: ${String(parsedArgs.message).slice(0, 60)}` : "");

        // Show tool call in UI
        setToolCalls(prev => [...prev, { callId, name: skillLabel, status: "running" }]);
        if (!isStateUpdate) {
          setTranscript(prev => [...prev, { role: "tool", text: `Sending to ${skillLabel}${msgPreview}...`, ts: Date.now() }]);
        }

        // Fire the tool call
        const currentSid = sessionIdRef.current;
        if (currentSid) {
          (async () => {
            try {
              // Phase 1: Fire — POST /tool-call
              const fireRes = await voiceFetch(`voice-conversation/${currentSid}/tool-call`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ call_id: callId, name: fnName, arguments: fnArgs }),
              });
              const fireJson = await fireRes.json();

              if (!fireJson.ok) {
                throw new Error(fireJson.error || "Failed to fire tool call");
              }

              // ── Local tool (update_conversation_state) — no polling needed ──
              if (fireJson.local) {
                console.log(`State update completed: ${fireJson.output}`);
                setToolCalls(prev => prev.map(tc =>
                  tc.callId === callId ? { ...tc, status: "done" } : tc
                ));

                // Send function_call_output immediately
                const dc = dcRef.current;
                if (dc && dc.readyState === "open") {
                  dc.send(JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: callId,
                      output: fireJson.output || '{"ok":true}',
                    },
                  }));
                  dc.send(JSON.stringify({ type: "response.create" }));
                }

                // Refresh instructions with updated state
                if (fireJson.instructions) {
                  sendSessionUpdate(fireJson.instructions);
                }
                return;
              }

              // ── Skill tool — refresh instructions (now includes running check) ──
              if (fireJson.instructions) {
                sendSessionUpdate(fireJson.instructions);
              }

              console.log(`Tool ${fnName} fired: jobId=${fireJson.jobId} — waiting for reply via communication layer...`);

              // Phase 2: Poll BOTH reply endpoint AND job-result endpoint (whichever finishes first)
              const POLL_INTERVAL = 2000;
              const MAX_POLLS = 30; // 30 × 2s = 60s max
              let pollResult = null;
              const jobId = fireJson.jobId;

              for (let i = 0; i < MAX_POLLS; i++) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL));

                // Poll reply endpoint (primary — pushed by communication layer)
                try {
                  const pollRes = await voiceFetch(`voice-conversation/${currentSid}/reply/${callId}`);
                  const pollJson = await pollRes.json();
                  if (pollJson.status === "done") {
                    pollResult = { ok: true, output: pollJson.output };
                    if (pollJson.instructions) sendSessionUpdate(pollJson.instructions);
                    break;
                  }
                  if (pollJson.status === "error") {
                    pollResult = { ok: false, output: JSON.stringify({ error: pollJson.error || "Skill failed" }) };
                    if (pollJson.instructions) sendSessionUpdate(pollJson.instructions);
                    break;
                  }
                } catch {}

                // Also poll job-result endpoint (fallback — direct job status)
                if (jobId) {
                  try {
                    const jobRes = await voiceFetch(`voice-conversation/${currentSid}/tool-result/${jobId}`);
                    const jobJson = await jobRes.json();
                    if (jobJson.status === "done") {
                      pollResult = { ok: true, output: jobJson.output };
                      if (jobJson.instructions) sendSessionUpdate(jobJson.instructions);
                      break;
                    }
                    if (jobJson.status === "error") {
                      pollResult = { ok: false, output: JSON.stringify({ error: jobJson.error || "Job failed" }) };
                      if (jobJson.instructions) sendSessionUpdate(jobJson.instructions);
                      break;
                    }
                  } catch {}
                }
              }

              if (!pollResult) {
                pollResult = { ok: false, output: JSON.stringify({ error: "Skill execution timed out after 60 seconds" }) };
              }

              console.log(`Tool ${fnName} reply:`, pollResult.ok ? "success" : "error");
              setToolCalls(prev => prev.map(tc =>
                tc.callId === callId ? { ...tc, status: pollResult.ok ? "done" : "error" } : tc
              ));

              // Send function_call_output back to OpenAI via data channel
              const dc = dcRef.current;
              if (dc && dc.readyState === "open") {
                dc.send(JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: pollResult.output || JSON.stringify({ error: "No output" }),
                  },
                }));
                // Trigger a new response so the AI speaks the result
                dc.send(JSON.stringify({ type: "response.create" }));
              }
            } catch (e) {
              console.error(`Tool ${fnName} error:`, e);
              setToolCalls(prev => prev.map(tc =>
                tc.callId === callId ? { ...tc, status: "error" } : tc
              ));

              const dc = dcRef.current;
              if (dc && dc.readyState === "open") {
                dc.send(JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify({ error: e.message || "Tool execution failed" }),
                  },
                }));
                dc.send(JSON.stringify({ type: "response.create" }));
              }
            }
          })();
        }
        break;
      }

      default:
        break;
    }
  }, [sessionId, sendTurnAndRefresh, sendSessionUpdate]);

  /* ─── Cleanup ─── */
  const cleanup = useCallback(() => {
    if (turnDebounceRef.current) { clearTimeout(turnDebounceRef.current); turnDebounceRef.current = null; }
    if (dcRef.current) { try { dcRef.current.close(); } catch {} dcRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioRef.current) { audioRef.current.srcObject = null; }
  }, []);

  const stopCall = useCallback(() => {
    cleanup();
    setState("idle");
    setAiPartial("");
    setUserPartial("");
  }, [cleanup]);

  /* ─── Splitter drag ─── */
  const onSplitterMouseDown = useCallback((e) => {
    e.preventDefault();
    const container = e.target.parentElement;
    const rect = container.getBoundingClientRect();
    const onMove = (me) => {
      const pct = ((me.clientY - rect.top) / rect.height) * 100;
      setSplitPos(Math.max(20, Math.min(80, pct)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const isActive = state === "connecting" || state === "connected";

  /* ─── Parse session instructions into prompt categories ─── */
  const promptSections = parsePromptSections(sessionMeta?.instructions);

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 80px)" }}>

      {/* ═══ LEFT PANEL ═══ */}
      <div style={{ flex: "0 0 50%", display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>

        {/* Upper: Prompt / Instructions */}
        <div style={{ ...panelBox, flex: `0 0 ${splitPos}%`, overflow: "auto", marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
          <div style={sectionTitle}>Session Prompt</div>
          {promptSections.length === 0 && (
            <div style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>
              Start a call to see the prompt
            </div>
          )}
          {promptSections.map((sec, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", marginBottom: 4 }}>{sec.title}</div>
              <pre style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, lineHeight: 1.5 }}>
                {sec.body}
              </pre>
            </div>
          ))}
        </div>

        {/* Splitter handle */}
        <div
          onMouseDown={onSplitterMouseDown}
          style={{
            height: 6, cursor: "row-resize", background: "#1e293b", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 40, height: 2, background: "#334155", borderRadius: 1 }} />
        </div>

        {/* Lower: Reserved */}
        <div style={{ ...panelBox, flex: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          <div style={sectionTitle}>Context / Reserved</div>
          <div style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>
            Reserved for future use
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div style={{ flex: "0 0 50%", display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Call controls */}
        <div style={{ ...panelBox, flexShrink: 0, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <span style={statusDot(state === "connected")} />
            <span style={{
              fontSize: 14, fontWeight: 600,
              color: state === "connected" ? "#4ade80" : state === "connecting" ? "#facc15" : "#94a3b8"
            }}>
              {state === "idle" && "Ready"}
              {state === "connecting" && "Connecting..."}
              {state === "connected" && "Connected — speak now"}
              {state === "error" && "Error"}
            </span>
            {sessionId && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569" }}>
                {sessionId}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <button style={btnStyle("start", isActive)} onClick={startCall} disabled={isActive}>
              Start Call
            </button>
            <button style={btnStyle("stop", !isActive)} onClick={stopCall} disabled={!isActive}>
              End Call
            </button>
          </div>

          {error && (
            <div style={{
              marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 13,
              background: "#2d0c0c", color: "#f87171", border: "1px solid #991b1b",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Transcript */}
        <div style={{ ...panelBox, flex: 1, overflow: "auto" }}>
          <div style={sectionTitle}>Transcript</div>

          {transcript.length === 0 && !aiPartial && !userPartial && (
            <div style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>
              Conversation will appear here...
            </div>
          )}

          {transcript.map((t, i) => (
            <div key={i} style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{
                fontSize: 11, fontWeight: 700, flexShrink: 0, width: 36,
                color: t.role === "ai" ? "#38bdf8" : t.role === "tool" ? "#facc15" : "#a78bfa",
              }}>
                {t.role === "ai" ? "AI" : t.role === "tool" ? "TOOL" : "YOU"}
              </span>
              <span style={{
                fontSize: 13, lineHeight: 1.5,
                color: t.role === "tool" ? "#94a3b8" : "#cbd5e1",
                fontStyle: t.role === "tool" ? "italic" : "normal",
              }}>{t.text}</span>
            </div>
          ))}

          {/* Streaming partials */}
          {userPartial && (
            <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start", opacity: 0.6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, width: 36, color: "#a78bfa" }}>YOU</span>
              <span style={{ fontSize: 13, color: "#cbd5e1", fontStyle: "italic" }}>{userPartial}…</span>
            </div>
          )}
          {aiPartial && (
            <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start", opacity: 0.6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, width: 36, color: "#38bdf8" }}>AI</span>
              <span style={{ fontSize: 13, color: "#cbd5e1", fontStyle: "italic" }}>{aiPartial}…</span>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>
      </div>

      <audio ref={audioRef} autoPlay style={{ display: "none" }} />
    </div>
  );
}

/* ─── Parse instructions text into titled sections ─── */
function parsePromptSections(instructions) {
  if (!instructions) return [];
  const sections = [];
  const lines = instructions.split("\n");
  let currentTitle = "System Context";
  let currentBody = [];

  for (const line of lines) {
    // Detect section headers (e.g., "Key points / notes:", "Open threads:", "You are Adas...")
    if (line.match(/^[A-Z][^:]*:/) && line.trim().endsWith(":")) {
      if (currentBody.length > 0 || sections.length === 0) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = line.replace(/:$/, "").trim();
      currentBody = [];
    } else if (line.startsWith("You are ") || line.startsWith("Speak ") || line.startsWith("If ") || line.startsWith("When ") || line.startsWith("Never ")) {
      if (currentBody.length > 0) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = "Behavior Rules";
      currentBody = [line];
    } else {
      currentBody.push(line);
    }
  }
  if (currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }

  return sections.filter(s => s.body.length > 0);
}
