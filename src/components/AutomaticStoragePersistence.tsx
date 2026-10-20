"use client";

import { useEffect } from "react";
import { requestVaultStoragePersistence } from "@/lib/vault/storage-status";

export default function AutomaticStoragePersistence({
  requestPersistence = requestVaultStoragePersistence,
}: {
  requestPersistence?: () => Promise<unknown>;
}) {
  useEffect(() => {
    void requestPersistence().catch(() => {
      // Ordinary browser storage remains available when persistence is unsupported or denied.
    });
  }, [requestPersistence]);

  return null;
}
