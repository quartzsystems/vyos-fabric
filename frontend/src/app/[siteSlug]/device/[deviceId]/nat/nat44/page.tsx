"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { NatRulesView } from "@/components/dashboard/NatRulesView";
import { Nat44Config, NatRule, StaticNatMapping, fetchInterfaceGroups, fetchInterfaceStats, fetchNat44 } from "@/lib/api";
import { useConfigChanges } from "@/lib/ConfigChanges";
import { useDevice } from "@/lib/DeviceContext";
import { Nat44RuleFormModal } from "./Nat44RuleFormModal";
import { StaticNatFormModal } from "./StaticNatFormModal";

type Section = "source" | "destination";

export default function Nat44Page() {
  const { deviceId } = useDevice();
  const { removeNat44Rule, removeStaticNat } = useConfigChanges();
  const [data, setData] = useState<Nat44Config | null>(null);
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [interfaceGroups, setInterfaceGroups] = useState<string[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // null = closed; rule undefined = create.
  const [modal, setModal] = useState<{ section: Section; rule?: NatRule } | null>(null);
  // null = closed; mapping undefined = create.
  const [staticModal, setStaticModal] = useState<{ mapping?: StaticNatMapping } | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      // Interface names + interface-group names populate the rule form's pickers;
      // tolerate their failure so a NAT read still renders.
      const [nat, ifs, groups] = await Promise.all([
        fetchNat44(deviceId),
        fetchInterfaceStats(deviceId).catch(() => []),
        fetchInterfaceGroups(deviceId).catch(() => []),
      ]);
      setData(nat);
      setInterfaces(ifs.map((i) => i.name).sort());
      setInterfaceGroups(groups);
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
          staticNat={data.static_nat}
          createLabel="Create rule"
          onCreate={(section) => setModal({ section })}
          onEdit={(rule, section) => setModal({ section, rule })}
          onDelete={(rule, section) => removeNat44Rule(section, Number(rule.rule))}
          onCreateStatic={() => setStaticModal({})}
          onEditStatic={(mapping) => setStaticModal({ mapping })}
          onDeleteStatic={(mapping) => removeStaticNat(Number(mapping.rule))}
        />
      )}
      {modal && data && (
        <Nat44RuleFormModal
          section={modal.section}
          initial={modal.rule}
          interfaces={interfaces}
          interfaceGroups={interfaceGroups}
          existing={modal.section === "source" ? data.source : data.destination}
          onClose={() => setModal(null)}
        />
      )}
      {staticModal && data && (
        <StaticNatFormModal
          initial={staticModal.mapping}
          interfaces={interfaces}
          existing={data.static_nat}
          onClose={() => setStaticModal(null)}
        />
      )}
    </ServiceScaffold>
  );
}
