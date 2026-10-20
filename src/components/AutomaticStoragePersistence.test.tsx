import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AutomaticStoragePersistence from "./AutomaticStoragePersistence";

it("asks the browser for durable storage automatically on app startup", async () => {
  const requestPersistence = vi.fn().mockResolvedValue(undefined);

  render(<AutomaticStoragePersistence requestPersistence={requestPersistence} />);

  await waitFor(() => expect(requestPersistence).toHaveBeenCalledTimes(1));
});
