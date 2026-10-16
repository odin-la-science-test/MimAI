/* <Text> de l'app : identique à celui de React Native, mais traduit les textes français connus quand la langue est l'anglais. */
import React from 'react';
import { Text as RNText } from 'react-native';
import type { TextProps } from 'react-native';
import { tr } from './index';

const map = (c: React.ReactNode): React.ReactNode => {
  if (typeof c === 'string') return tr(c);
  if (Array.isArray(c)) return c.map(x => (typeof x === 'string' ? tr(x) : x));
  return c;
};

export const Text = React.forwardRef<RNText, TextProps>(function Text({ children, ...rest }, ref) {
  return <RNText ref={ref} {...rest}>{map(children)}</RNText>;
});
