import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { DiffResponse, ErrorResponse } from "../../../shared/types";
import { App } from "../App";
import { demoDiff } from "./fixtures";

type Reply = { status: number; body: DiffResponse | ErrorResponse };

/** Renders the whole app with only `fetch` stubbed. `respond` changes what the next fetch returns. */
export function renderApp(initial: Reply = { status: 200, body: demoDiff }) {
  let reply = initial;
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  const view = render(<App />);
  return {
    ...view,
    user,
    fetchMock,
    respond(next: Reply) {
      reply = next;
    },
  };
}
