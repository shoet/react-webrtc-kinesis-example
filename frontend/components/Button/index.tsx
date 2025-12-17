import clsx from "clsx";
import type { ComponentProps } from "react";

export const Button = (props: ComponentProps<"button">) => {
  const { className, ...rest } = props;
  return (
    <button
      className={clsx(
        "px-4 py-2 text-white font-bold text-base rounded-md",
        "bg-gradient-to-br from-blue-600 to-purple-600",
        "cursor-pointer hover:from-blue-700 to-purple-700",
        "disabled:from-slate-500 disabled:to-slate-600 disabled:cursor-default",
        className,
      )}
      {...rest}
    />
  );
};
