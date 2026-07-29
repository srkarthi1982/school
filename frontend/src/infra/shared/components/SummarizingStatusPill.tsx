import { useEffect, useRef, useState } from "react";
import { client } from "../../../api/client";

type StatusType = "complete" | "inprogress" | "error" | undefined | null;

export default function SummarizingStatusPill({
    materialId,
}: {
    materialId: string | number;
}) {
    const [status, setStatus] = useState<StatusType>();
    const [statusDesc, setStatusDesc] = useState<string>();
    const [errorMessage, setErrorMessage] = useState<string>();

    const wsRef = useRef<WebSocket | null>(null);
    const mountedRef = useRef(true);

    // REST initial fetch — handles case where WS hasn't connected yet
    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const { data } = await client.get({
                    url: `/api/v1/library/summary/status/${materialId}`,
                });
                const result = (data as any)?.data;
                if (result?.error_message) {
                    setStatus("error");
                    setStatusDesc("Error");
                    setErrorMessage(result.error_message);
                } else if (result?.summarize_ts) {
                    setStatus("complete");
                    setStatusDesc(result.status);
                } else {
                    setStatus("inprogress");
                    setStatusDesc(result?.status);
                }
            } catch {
                // ignore — WS will provide updates
            }
        };
        fetchInitial();
    }, [materialId]);

    // WebSocket: connect → subscribe → receive status updates → close on unmount
    useEffect(() => {
        mountedRef.current = true;
        const token = localStorage.getItem("access_token");
        if (!token) return;

        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const wsUri = `${proto}://${window.location.host}/api/v1/library/ws?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(wsUri);
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: "subscribe", material_id: String(materialId) }));
        };

        ws.onmessage = (ev) => {
            const data = JSON.parse(ev.data);
            if (data.material_id !== String(materialId)) return;

            if (data.type === "library.summary_status") {
                if (!mountedRef.current) return;

                if (data.error_message) {
                    setStatus("error");
                    setStatusDesc("Error");
                    setErrorMessage(data.error_message);
                } else if (data.summarize_ts) {
                    setStatus("complete");
                    setStatusDesc(data.status);
                } else {
                    setStatus("inprogress");
                    setStatusDesc(data.status);
                }
            } else if (data.type === "error") {
                setStatus("error");
                setStatusDesc("Error");
                setErrorMessage(data.message);
            }
        };

        ws.onclose = () => { /* expected on unmount — no-op */ };
        ws.onerror = () => { /* ignore — onclose fires next */ };

        return () => {
            mountedRef.current = false;
            wsRef.current?.close();
        };
    }, [materialId]);

    return (
        <>
            {status === "complete" && (
                <span
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold leading-[1.2]"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#16A34A" }}
                >
                    {statusDesc}
                </span>
            )}
            {status === "inprogress" && (
                <span
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold leading-[1.2] animate-pulse"
                    style={{ background: "rgba(124,58,237,0.12)", color: "#7C3AED" }}
                >
                    Summarizing
                </span>
            )}
            {status === "error" && (
                <span
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold leading-[1.2]"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#DC2626" }}
                    title={errorMessage || undefined}
                >
                    Error
                </span>
            )}
        </>
    );
}
