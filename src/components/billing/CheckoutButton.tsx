"use client";

import { useState } from "react";
import CheckoutModal from "./CheckoutModal";
import type { CheckoutPlanKey, BillingInterval } from "@/lib/plan-config";

interface CheckoutButtonProps {
  plan: CheckoutPlanKey;
  interval: BillingInterval;
  teamName?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function CheckoutButton({
  plan,
  interval,
  teamName,
  children,
  className = "",
  disabled = false,
}: CheckoutButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = () => {
    if (!disabled) {
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`${className} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        {children}
      </button>

      <CheckoutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        plan={plan}
        interval={interval}
        teamName={teamName}
      />
    </>
  );
}
