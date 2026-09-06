import { useId } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function WorkspaceModeControl() {
  const descriptionId = useId();
  const description = "View this terminal session as a conversation. Coming in a future update.";
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Session view">
      <Button size="xs" variant="secondary" aria-pressed="true">
        Terminal
      </Button>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              aria-describedby={descriptionId}
              className="inline-flex items-center gap-1"
            />
          }
        >
          <Button size="xs" variant="ghost" disabled aria-describedby={descriptionId}>
            Chat
          </Button>
          <span className="text-xs text-muted-foreground">Coming soon</span>
        </TooltipTrigger>
        <TooltipPopup>{description}</TooltipPopup>
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
    </div>
  );
}
