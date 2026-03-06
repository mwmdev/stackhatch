"use client";

import { useState, useEffect, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from "@stripe/react-stripe-js";
import { X, CreditCard, Loader2 } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: 'pro' | 'team5' | 'team15';
  interval: 'monthly' | 'annual';
  teamName?: string;
}

interface CheckoutFormProps {
  plan: 'pro' | 'team5' | 'team15';
  interval: 'monthly' | 'annual';
  teamName?: string;
  onSuccess: () => void;
  onError: (error: string) => void;
}

function CheckoutForm({ plan, interval, teamName, onSuccess, onError }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      onError("Stripe has not loaded yet. Please try again.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Create checkout session
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan,
          interval,
          teamName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      throw new Error('No checkout URL received');
    } catch (err) {
      console.error('Checkout error:', err);
      onError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: 'var(--foreground)',
        backgroundColor: 'var(--card)',
        '::placeholder': {
          color: 'var(--muted-foreground)',
        },
      },
      invalid: {
        color: '#ef4444',
      },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-md">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="card-element" className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Payment Method
        </label>
        <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--card)]">
          <CardElement
            id="card-element"
            options={cardElementOptions}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            Subscribe
          </>
        )}
      </button>

      <div className="text-xs text-[var(--muted-foreground)] text-center">
        Secure payment powered by Stripe. Your payment information is encrypted and secure.
      </div>
    </form>
  );
}

export default function CheckoutModal({ isOpen, onClose, plan, interval, teamName }: CheckoutModalProps) {
  // Reset state when modal closes/opens by using the isOpen prop as part of key
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  // Enhanced close handler that also resets state
  const handleClose = useCallback(() => {
    setError("");
    setSuccess(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleClose]);

  const handleSuccess = () => {
    setSuccess(true);
    // Will redirect to checkout, so no need for additional handling
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-[var(--card)] rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Subscribe to {plan === 'pro' ? 'Pro' : plan === 'team5' ? 'Team (5 users)' : 'Team (15 users)'}
            </h2>
            <button
              onClick={handleClose}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <Elements stripe={stripePromise}>
            <CheckoutForm
              plan={plan}
              interval={interval}
              teamName={teamName}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </Elements>
        </div>
      </div>
    </div>
  );
}