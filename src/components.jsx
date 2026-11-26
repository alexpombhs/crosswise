import React from 'react';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import { createTheme } from '@mui/material/styles';

export const crosswiseTheme = createTheme({
  palette: {
    primary: { main: '#12384c' },
    secondary: { main: '#155e7e' },
    text: { primary: '#153348' },
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
});

export function CrosswiseButton({ className = '', variant = 'contained', ...props }) {
  return <Button className={className} variant={variant} disableElevation {...props} />;
}

export function CrosswiseCheckbox(props) {
  return <Checkbox size="small" {...props} />;
}

export function CrosswiseAction(props) {
  return <ButtonBase {...props} />;
}

export function CrosswiseIconButton({ className = '', tooltip, ...props }) {
  const button = <IconButton className={`icon-button ${className}`.trim()} {...props} />;
  return tooltip ? <Tooltip title={tooltip} describeChild>{button}</Tooltip> : button;
}

export function CrosswiseAddressInput({ id, label, placeholder }) {
  return (
    <InputBase
      className="address-input"
      id={id}
      placeholder={placeholder}
      autoComplete="off"
      inputProps={{
        'aria-label': label,
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'aria-controls': `${id}-suggestions`,
      }}
    />
  );
}
