import type { Meta, StoryObj } from "@storybook/react";
import { Button } from ".";

export default {
  title: "Button",
  component: Button,
} as Meta<typeof Button>;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  render: (args) => {
    return <Button {...args}>Button</Button>;
  },
};

export const Disabled: Story = {
  render: (args) => {
    return (
      <Button {...args} disabled>
        Button
      </Button>
    );
  },
};
