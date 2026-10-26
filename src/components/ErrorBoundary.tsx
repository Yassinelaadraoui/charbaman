import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { colors } from '../theme';
import { t } from '../i18n';

// Catches a crash in any screen and offers a way back to the menu instead of a blank screen.
type State = { failed: boolean };
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; onReset: () => void }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Charbaman crashed', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{t('errorTitle')}</Text>
        <Text style={styles.body}>{t('errorBody')}</Text>
        <Button
          label={t('errorRetry')}
          variant="light"
          onPress={() => {
            this.setState({ failed: false });
            this.props.onReset();
          }}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.orangeDeep, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  title: { color: colors.white, fontWeight: '900', fontSize: 26, textAlign: 'center' },
  body: { color: colors.cream, fontWeight: '700', fontSize: 16, textAlign: 'center' },
});
