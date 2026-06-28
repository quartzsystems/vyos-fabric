"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { NatRulesView } from "@/components/dashboard/NatRulesView";
import { Nat44Config, NatRule, fetchEthernet, fetchNat44 } from "@/lib/api";
import { useConfigChanges } from "@/lib/ConfigChanges";
import { useDevice } from "@/lib/DeviceContext";
import { Nat44RuleFormModal } from "./Nat44RuleFormModal";

type Section = "source" | "destination";

export default function Nat44Page() {
  const { deviceId } = useDevice();
  const { removeNat44Rule } = useConfigChanges();
  const [data, setData] = useState<Nat44Config | null>(null);
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // null = closed; rule undefined = create.
  const [modal, setModal] = useState<{ section: Section; rule?: NatRule } | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      // Ethernet names are a convenience datalist for the interface field; tolerate failure.
      const [nat, eths] = await Promise.all([
        fetchNat44(deviceId),
        fetchEthernet(deviceId).catch(() => []),
      ]);
      setData(nat);
      setInterfaces(eths.map((e) => e.name).sort());
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load NAT44.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ServiceScaffold
      title="NAT44"
      subtitle="IPv4-to-IPv4 source (SNAT) and destination (DNAT) translation"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading NAT44…"
    >
      {data && (
        <NatRulesView
          source={data.source}
          destination={data.destination}
          createLabel="Create rule"
          onCreate={(section) => setModal({ section })}
          onEdit={(rule, section) => setModal({ section, rule })}
          onDelete={(rule, section) => removeNat44Rule(section, Number(rule.rule))}
        />
      )}
      {modal && data && (
        <Nat44RuleFormModal
          section={modal.section}
          initial={modal.rule}
          interfaces={interfaces}
          existing={modal.section === "source" ? data.source : data.destination}
          onClose={() => setModal(null)}
        />
      )}
    </ServiceScaffold>
  );
}
