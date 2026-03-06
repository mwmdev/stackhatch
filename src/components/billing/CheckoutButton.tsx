"use client";

import { useState } from "react";
import CheckoutModal from "./CheckoutModal";

interface CheckoutButtonProps {
  plan: 'pro' | 'team5' | 'team15';
  interval: 'monthly' | 'annual';
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
  disabled = false
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
        className={`${className} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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