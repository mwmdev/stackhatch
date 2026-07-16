"use client";

import Link from "next/link";
import {
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

type IconControlBaseProps = {
  /** The control's accessible name. */
  label: string;
  /** Defaults to the accessible label when omitted. */
  tooltip?: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "quiet" | "outline" | "danger";
  tooltipPlacement?: "top" | "right" | "bottom" | "left";
};

type IconControlButtonProps = IconControlBaseProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label" | "aria-pressed" | "children" | "className" | "disabled"
  > & {
    href?: never;
    pressed?: boolean;
  };

type IconControlLinkProps = IconControlBaseProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "aria-label" | "aria-current" | "children" | "className" | "href"
  > & {
    href: string;
    pressed?: never;
  };

export type IconControlProps = IconControlButtonProps | IconControlLinkProps;

function controlClassName(className?: string) {
  return ["icon-control", className].filter(Boolean).join(" ");
}

export default function IconControl(props: IconControlProps) {
  const tooltipId = `icon-control-tooltip-${useId().replaceAll(":", "")}`;
  const {
    active,
    children,
    className,
    disabled,
    label,
    tooltip = label,
    tooltipPlacement = "bottom",
    variant = "quiet",
  } = props;

  const icon = (
    <span className="icon-control__icon" aria-hidden="true">
      {children}
    </span>
  );

  let control: ReactNode;

  if ("href" in props && props.href !== undefined) {
    const {
      href,
      onClick,
      onKeyDown,
      active: _active,
      children: _children,
      className: _className,
      disabled: _disabled,
      label: _label,
      pressed: _pressed,
      tooltip: _tooltip,
      tooltipPlacement: _tooltipPlacement,
      variant: _variant,
      ...linkProps
    } = props;

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (disabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onClick?.(event);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
      if (disabled) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      onKeyDown?.(event);
    };

    control = (
      <Link
        {...linkProps}
        href={href}
        aria-label={label}
        aria-describedby={tooltipId}
        aria-current={active ? "page" : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : linkProps.tabIndex}
        data-active={active || undefined}
        data-variant={variant}
        className={controlClassName(className)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {icon}
      </Link>
    );
  } else {
    const {
      onClick,
      pressed,
      active: _active,
      children: _children,
      className: _className,
      disabled: _disabled,
      label: _label,
      tooltip: _tooltip,
      tooltipPlacement: _tooltipPlacement,
      variant: _variant,
      ...buttonProps
    } = props;

    control = (
      <button
        {...buttonProps}
        type={buttonProps.type ?? "button"}
        aria-label={label}
        aria-describedby={tooltipId}
        aria-pressed={pressed}
        disabled={disabled}
        data-active={active || undefined}
        data-variant={variant}
        className={controlClassName(className)}
        onClick={onClick}
      >
        {icon}
      </button>
    );
  }

  return (
    <span className="icon-control-wrap">
      {control}
      <span
        id={tooltipId}
        role="tooltip"
        data-placement={tooltipPlacement}
        className="icon-control__tooltip"
      >
        {tooltip}
      </span>
    </span>
  );
}
