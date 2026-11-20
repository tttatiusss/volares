import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSupabaseClient } from '@/lib/supabase';

const colors = {
  blue: '#3593FC',
  navy: '#171078',
  text: '#20243A',
  muted: '#777D91',
  white: '#FFFFFF',
  error: '#C73547',
};

export default function HomeScreen() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const supabase = getSupabaseClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;

        if (sessionError) {
          setErrorMessage(sessionError.message);
          setLoading(false);
          return;
        }

        if (!sessionData.session) {
          router.replace('/');
          return;
        }

        const { data, error } = await supabase.auth.getUser();
        if (!active) return;

        if (error) {
          setErrorMessage(error.message);
          setLoading(false);
          return;
        }

        if (!data.user) {
          router.replace('/');
          return;
        }

        const firstName = data.user.user_metadata.first_name;
        setName(typeof firstName === 'string' ? firstName : data.user.email ?? 'Viajante');
        setLoading(false);
      } catch (error) {
        if (!active) return;
        setErrorMessage(
          error instanceof Error ? error.message : 'Não foi possível carregar sua conta.',
        );
        setLoading(false);
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setErrorMessage('');

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      router.replace('/');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível encerrar sua sessão.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.blue} size="large" />
        ) : errorMessage && !name ? (
          <>
            <Text style={styles.error}>{errorMessage}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/')}>
              <Text style={styles.loginLink}>Voltar ao login</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.brand}>Volares</Text>
            <Text style={styles.title}>Olá, {name}!</Text>
            <Text style={styles.subtitle}>Sua sessão está conectada ao Supabase.</Text>
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={signingOut}
              onPress={handleSignOut}
              style={({ pressed }) => [
                styles.button,
                (pressed || signingOut) && styles.buttonPressed,
              ]}>
              {signingOut ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Sair</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  brand: {
    color: colors.navy,
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 28,
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 10,
    textAlign: 'center',
  },
  button: {
    minWidth: 140,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.blue,
    marginTop: 30,
    paddingHorizontal: 24,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginTop: 18,
    textAlign: 'center',
  },
  loginLink: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 20,
  },
});
