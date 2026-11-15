import { useEffect, useRef } from "react";

export function useSSE(
  hackathonId: string | null,
  onEvent: (eventType: string, data: Record<string, unknown>) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!hackathonId) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource(`/api/v1/events?hackathonId=${hackathonId}`);

      const eventTypes = [
        "team.created",
        "team.updated",
        "team.deleted",
        "team.member_joined",
        "team.member_left",
        "team.leader_changed",
        "join_request.created",
        "join_request.accepted",
        "join_request.declined",
      ];

      eventTypes.forEach((eventType) => {
        eventSource!.addEventListener(eventType, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            onEventRef.current(eventType, data);
          } catch (err) {
            console.error("SSE parse error", err);
          }
        });
      });

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
    };
  }, [hackathonId]);
}
