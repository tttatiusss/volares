import { Link, router } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandAssets } from '@/constants/brand';
import { getSupabaseClient } from '@/lib/supabase';

const colors = {
  blue: '#3593FC',
  navy: '#171078',
  pink: '#EF3B91',
  text: '#20243A',
  muted: '#777D91',
  border: '#E4E8F0',
  white: '#FFFFFF',
  error: '#C73547',
};

type AuthScreenProps = {
  mode: 'login' | 'register';
};

type Notice = {
  message: string;
  kind: 'error' | 'info';
};

type AuthFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  icon: SymbolViewProps['name'];
  keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
};

function AuthField({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  keyboardType = 'default',
  secureTextEntry = false,
  passwordVisible = false,
  onTogglePassword,
}: AuthFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <SymbolView name={icon} tintColor={colors.muted} size={19} />
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={
            secureTextEntry || keyboardType === 'email-address' ? 'none' : 'words'
          }
          autoCorrect={false}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#A0A5B5"
          returnKeyType="next"
          secureTextEntry={secureTextEntry && !passwordVisible}
          selectionColor={colors.blue}
          style={styles.input}
          value={value}
        />
        {secureTextEntry && onTogglePassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={onTogglePassword}
            style={styles.passwordToggle}>
            <Text style={styles.passwordToggleText}>
              {passwordVisible ? 'Ocultar' : 'Mostrar'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const isRegister = mode === 'register';
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleSubmit() {
    if (isSubmitting) return;

    const normalizedEmail = email.trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

    if (isRegister && firstName.trim().length === 0) {
      setNotice({ kind: 'error', message: 'Informe seu nome.' });
      return;
    }

    if (isRegister && surname.trim().length === 0) {
      setNotice({ kind: 'error', message: 'Informe seu sobrenome.' });
      return;
    }

    if (!validEmail) {
      setNotice({ kind: 'error', message: 'Informe um e-mail válido.' });
      return;
    }

    if (password.length < (isRegister ? 8 : 1)) {
      setNotice({
        kind: 'error',
        message: isRegister
          ? 'A senha precisa ter pelo menos 8 caracteres.'
          : 'Informe sua senha.',
      });
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setNotice({ kind: 'error', message: 'As senhas não coincidem.' });
      return;
    }

    if (isRegister && !acceptedTerms) {
      setNotice({ kind: 'error', message: 'Aceite os termos para continuar.' });
      return;
    }

    setNotice(null);
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseClient();
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: surname.trim(),
              full_name: `${firstName.trim()} ${surname.trim()}`,
            },
          },
        });

        if (error) {
          setNotice({ kind: 'error', message: error.message });
          return;
        }

        if (data.session) {
          router.replace('/home');
          return;
        }

        setNotice({
          kind: 'info',
          message: 'Cadastro enviado. Confira seu e-mail para confirmar a conta e depois entre.',
        });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setNotice({ kind: 'error', message: error.message });
        return;
      }

      router.replace('/home');
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Não foi possível conectar ao Supabase.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function showPasswordRecoveryMessage() {
    setNotice({
      kind: 'info',
      message: 'A recuperação de senha ainda precisa ser configurada no Supabase.',
    });
  }

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoidingView}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <Image
                accessibilityLabel="Volares"
                contentFit="contain"
                source={BrandAssets.logo}
                style={styles.brandLogo}
              />
            </View>

            <View style={styles.card}>
              <View style={styles.form}>
                <Text style={styles.title}>
                  {isRegister ? 'Crie sua conta' : 'Boas-vindas de volta'}
                </Text>
                <Text style={styles.subtitle}>
                  {isRegister
                    ? 'Cadastre-se para começar a viajar com a Volares.'
                    : 'Entre para continuar sua jornada com a Volares.'}
                </Text>

                {isRegister ? (
                  <>
                    <AuthField
                      icon={{ ios: 'person', android: 'person', web: 'person' }}
                      label="Nome"
                      onChangeText={setFirstName}
                      placeholder="Seu nome"
                      value={firstName}
                    />
                    <AuthField
                      icon={{ ios: 'person', android: 'person', web: 'person' }}
                      label="Sobrenome"
                      onChangeText={setSurname}
                      placeholder="Seu sobrenome"
                      value={surname}
                    />
                  </>
                ) : null}

                <AuthField
                  icon={{ ios: 'envelope', android: 'email', web: 'email' }}
                  keyboardType="email-address"
                  label="E-mail"
                  onChangeText={setEmail}
                  placeholder="azul@gmail.com"
                  value={email}
                />

                <AuthField
                  icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
                  label="Senha"
                  onChangeText={setPassword}
                  onTogglePassword={() => setPasswordVisible((visible) => !visible)}
                  passwordVisible={passwordVisible}
                  placeholder={isRegister ? 'Mínimo de 8 caracteres' : 'Digite sua senha'}
                  secureTextEntry
                  value={password}
                />

                {isRegister ? (
                  <>
                    <AuthField
                      icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
                      label="Confirme sua senha"
                      onChangeText={setConfirmPassword}
                      onTogglePassword={() => setPasswordVisible((visible) => !visible)}
                      passwordVisible={passwordVisible}
                      placeholder="Digite a senha novamente"
                      secureTextEntry
                      value={confirmPassword}
                    />
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: acceptedTerms }}
                      onPress={() => setAcceptedTerms((accepted) => !accepted)}
                      style={styles.termsRow}>
                      <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                        {acceptedTerms ? (
                          <SymbolView
                            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                            size={12}
                            tintColor={colors.white}
                          />
                        ) : null}
                      </View>
                      <Text style={styles.termsText}>
                        Li e aceito os Termos de Uso e a Política de Privacidade.
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={showPasswordRecoveryMessage}
                    style={styles.forgotPassword}>
                    <Text style={styles.linkText}>Esqueceu a senha?</Text>
                  </Pressable>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
                  disabled={isSubmitting}
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (pressed || isSubmitting) && styles.buttonPressed,
                  ]}>
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {isSubmitting
                      ? isRegister
                        ? 'Criando conta...'
                        : 'Entrando...'
                      : isRegister
                        ? 'Criar minha conta'
                        : 'Entrar'}
                  </Text>
                  {!isSubmitting ? (
                    <SymbolView
                      name={{
                        ios: 'arrow.right',
                        android: 'arrow_forward',
                        web: 'arrow_forward',
                      }}
                      size={17}
                      tintColor={colors.white}
                    />
                  ) : null}
                </Pressable>

                {notice ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.notice,
                      notice.kind === 'error' ? styles.errorNotice : styles.infoNotice,
                    ]}>
                    {notice.message}
                  </Text>
                ) : null}

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    {isRegister ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}
                  </Text>
                  <Link href={isRegister ? '/' : '/register'} asChild>
                    <Pressable accessibilityRole="link">
                      <Text style={styles.linkText}>
                        {isRegister ? 'Entrar' : 'Cadastre-se'}
                      </Text>
                    </Pressable>
                  </Link>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.white,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.blue,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.blue,
  },
  hero: {
    minHeight: 178,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  brandLogo: {
    width: 220,
    height: 105,
  },
  tagline: {
    alignSelf: 'center',
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    marginTop: -3,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 28,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 15,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  passwordToggle: {
    paddingVertical: 10,
    paddingLeft: 4,
  },
  passwordToggleText: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '600',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 20,
    paddingVertical: 4,
  },
  linkText: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: '700',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 0,
    marginBottom: 18,
  },
  checkbox: {
    width: 19,
    height: 19,
    borderColor: '#B9C1D0',
    borderWidth: 1,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  termsText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  notice: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 13,
    textAlign: 'center',
  },
  errorNotice: {
    color: colors.error,
  },
  infoNotice: {
    color: colors.navy,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 24,
  },
  footerText: {
    color: colors.muted,
    fontSize: 14,
  },
});
