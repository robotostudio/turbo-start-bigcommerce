import { AccessDeniedIcon, WarningOutlineIcon } from "@sanity/icons";
import { Badge, Flex, Stack, Text } from "@sanity/ui";
import { memo } from "react";

type ErrorStateItemProps = {
  type: "error" | "warning";
  message: string;
  id: string;
};

type ErrorStatesProps = {
  errors?: string[];
  warnings?: string[];
};

const ErrorStateItem = memo(function ErrorStateItemComponent({
  type,
  message,
  id,
}: ErrorStateItemProps) {
  const isErrorType = type === "error";
  const IconComponent = isErrorType ? AccessDeniedIcon : WarningOutlineIcon;
  const badgeTone = isErrorType ? ("critical" as const) : ("caution" as const);
  const ariaLabel = isErrorType ? "Error" : "Warning";

  return (
    <Badge
      aria-labelledby={`error-${id}`}
      radius={2}
      role="alert"
      style={{ padding: "1rem" }}
      tone={badgeTone}
    >
      <Flex align="center" gap={2}>
        <IconComponent
          aria-label={ariaLabel}
          style={{
            color: "var(--card-fg-color)",
          }}
        />
        <Text id={`error-${id}`} size={1} style={{ flex: 1 }}>
          {message}
        </Text>
      </Flex>
    </Badge>
  );
});

// Helper function to generate unique IDs for accessibility
function generateErrorId(message: string, index: number): string {
  return `${message.slice(0, 10).replace(/\s+/g, "-").toLowerCase()}-${index}`;
}

// `useSlugValidation` already dedupes, so this renders what it is given.
export const ErrorStates = memo(function ErrorStatesComponent({
  errors = [],
  warnings = [],
}: ErrorStatesProps) {
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <Stack aria-label="Validation messages" role="region" space={4}>
      {errors.length > 0 && (
        <Stack aria-label="Errors" role="group" space={2}>
          {errors.map((error, index) => (
            <ErrorStateItem
              id={generateErrorId(error, index)}
              key={error}
              message={error}
              type="error"
            />
          ))}
        </Stack>
      )}

      {warnings.length > 0 && (
        <Stack aria-label="Warnings" role="group" space={2}>
          {warnings.map((warning, index) => (
            <ErrorStateItem
              id={generateErrorId(warning, index)}
              key={warning}
              message={warning}
              type="warning"
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
});
