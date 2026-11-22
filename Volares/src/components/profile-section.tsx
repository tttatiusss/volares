import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandAssets } from '@/constants/brand';

export type ProfileDetails = {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string | null;
  avatarUrl: string | null;
};

type ProfileSectionProps = {
  profile: ProfileDetails;
  profileError: string;
  signOutError: string;
  signingOut: boolean;
  deleteAccountError: string;
  deletingAccount: boolean;
  onSignOut: () => void;
  onDeleteAccount: () => void;
};

const colors = {
  blue: '#3593FC',
  navy: '#171078',
  text: '#20243A',
  muted: '#777D91',
  border: '#E4E8F0',
  surface: '#F6F8FC',
  white: '#FFFFFF',
  error: '#C73547',
};

const profileCategories: {
  title: string;
  subtitle: string;
  icon: SymbolViewProps['name'];
}[] = [
  {
    title: 'Métodos de pagamento',
    subtitle: 'Gerencie seus cartões',
    icon: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  },
  {
    title: 'Notificações',
    subtitle: 'Alertas de push e e-mail',
    icon: { ios: 'bell', android: 'notifications', web: 'notifications' },
  },
  {
    title: 'Privacidade e segurança',
    subtitle: 'Senha e dados da conta',
    icon: { ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' },
  },
  {
    title: 'Ajuda e suporte',
    subtitle: 'Dúvidas e contato',
    icon: { ios: 'questionmark.circle', android: 'help_outline', web: 'help_outline' },
  },
];

function formatMemberSince(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function ProfileSection({
  profile,
  profileError,
  signOutError,
  signingOut,
  deleteAccountError,
  deletingAccount,
  onSignOut,
  onDeleteAccount,
}: ProfileSectionProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Viajante Volares';
  const requiredConfirmation = `${fullName} Volares`;
  const canConfirmDeletion = confirmationText === requiredConfirmation;
  const photoSource =
    profile.avatarUrl && !photoFailed
      ? { uri: profile.avatarUrl }
      : BrandAssets.profilePlaceholder;

  return (
    <View style={styles.content}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.subtitle}>Seus dados pessoais e informações da conta.</Text>

      <View style={styles.identityCard}>
        <View style={styles.avatarFrame}>
          <Image
            accessibilityLabel={profile.avatarUrl && !photoFailed ? 'Foto do perfil' : 'Imagem padrão do perfil'}
            contentFit="cover"
            onError={() => setPhotoFailed(true)}
            source={photoSource}
            style={styles.avatar}
          />
        </View>
        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.email}>{profile.email || 'E-mail não informado'}</Text>
      </View>

      <Text style={styles.sectionTitle}>Informações pessoais</Text>
      <View style={styles.detailsCard}>
        <ProfileRow label="Nome" value={profile.firstName || 'Não informado'} />
        <View style={styles.divider} />
        <ProfileRow label="Sobrenome" value={profile.lastName || 'Não informado'} />
        <View style={styles.divider} />
        <ProfileRow label="E-mail" value={profile.email || 'Não informado'} />
        {profile.createdAt ? (
          <>
            <View style={styles.divider} />
            <ProfileRow label="Cliente desde" value={formatMemberSince(profile.createdAt)} />
          </>
        ) : null}
      </View>

      <View style={styles.categoriesCard}>
        {profileCategories.map((category, index) => (
          <View key={category.title}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.categoryRow}>
              <View style={styles.categoryIcon}>
                <SymbolView name={category.icon} tintColor={colors.blue} size={20} />
              </View>
              <View style={styles.categoryCopy}>
                <Text style={styles.categoryTitle}>{category.title}</Text>
                <Text style={styles.categorySubtitle}>{category.subtitle}</Text>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                tintColor={colors.muted}
                size={16}
              />
            </View>
          </View>
        ))}
      </View>

      {profileError ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorMessage}>
          Não foi possível carregar todos os dados do perfil: {profileError}
        </Text>
      ) : null}
      {signOutError ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorMessage}>
          {signOutError}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: signingOut, disabled: signingOut || deletingAccount }}
        disabled={signingOut || deletingAccount}
        onPress={onSignOut}
        style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
        {signingOut ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <SymbolView
            name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
            tintColor={colors.white}
            size={18}
          />
        )}
        <Text style={styles.signOutText}>
          {signingOut ? 'Saindo da conta...' : 'Sair da conta'}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: signingOut || deletingAccount }}
        disabled={signingOut || deletingAccount}
        onPress={() => {
          setConfirmationText('');
          setDeleteDialogOpen(true);
        }}
        style={({ pressed }) => [styles.deleteAccountButton, pressed && styles.pressed]}>
        <SymbolView
          name={{ ios: 'trash', android: 'delete', web: 'delete' }}
          tintColor={colors.white}
          size={18}
        />
        <Text style={styles.deleteAccountText}>Excluir conta</Text>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!deletingAccount) setDeleteDialogOpen(false);
        }}
        transparent
        visible={deleteDialogOpen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScrollView}>
            <View style={styles.deleteDialog}>
              <Text style={styles.deleteDialogTitle}>Excluir conta permanentemente?</Text>
              <Text style={styles.deleteDialogMessage}>
                Seu perfil, reservas e transações serão apagados. Esta ação não pode ser desfeita.
              </Text>
              <Text style={styles.confirmationLabel}>
                Para confirmar, digite seu nome completo seguido de “Volares”:
              </Text>
              <Text style={styles.confirmationPhrase}>{requiredConfirmation}</Text>
              <TextInput
                accessibilityLabel="Confirmação para exclusão da conta"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!deletingAccount}
                onChangeText={setConfirmationText}
                placeholder={requiredConfirmation}
                placeholderTextColor="#A0A5B5"
                style={styles.confirmationInput}
                value={confirmationText}
              />
              {deleteAccountError ? (
                <Text accessibilityLiveRegion="polite" style={styles.errorMessage}>
                  {deleteAccountError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  busy: deletingAccount,
                  disabled: !canConfirmDeletion || deletingAccount,
                }}
                disabled={!canConfirmDeletion || deletingAccount}
                onPress={onDeleteAccount}
                style={({ pressed }) => [
                  styles.confirmDeleteButton,
                  !canConfirmDeletion && styles.confirmDeleteButtonDisabled,
                  pressed && styles.pressed,
                ]}>
                {deletingAccount ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : null}
                <Text style={styles.confirmDeleteText}>
                  {deletingAccount ? 'Excluindo conta...' : 'Excluir permanentemente'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={deletingAccount}
                onPress={() => setDeleteDialogOpen(false)}
                style={({ pressed }) => [styles.cancelDeleteButton, pressed && styles.pressed]}>
                <Text style={styles.cancelDeleteText}>Cancelar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  eyebrow: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.25,
  },
  title: {
    color: colors.navy,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  identityCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.white,
    marginTop: 22,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  avatarFrame: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.blue,
    borderRadius: 56,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  name: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  email: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 8,
  },
  detailsCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.white,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  categoriesCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.white,
    marginTop: 16,
    paddingHorizontal: 12,
  },
  categoryRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  categoryIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
  },
  categoryCopy: {
    flex: 1,
    minWidth: 0,
  },
  categoryTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  categorySubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  profileRow: {
    minHeight: 62,
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
  },
  rowLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  rowValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  errorMessage: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  signOutButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 14,
    backgroundColor: colors.blue,
    marginTop: 18,
  },
  signOutText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteAccountButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 14,
    backgroundColor: colors.error,
    marginTop: 10,
  },
  deleteAccountText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 29, 52, 0.45)',
    padding: 20,
  },
  modalScrollView: {
    flex: 1,
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  deleteDialog: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    backgroundColor: colors.white,
    padding: 22,
  },
  deleteDialogTitle: {
    color: colors.navy,
    fontSize: 19,
    fontWeight: '800',
  },
  deleteDialogMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },
  confirmationLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 18,
  },
  confirmationPhrase: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 6,
  },
  confirmationInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 14,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  confirmDeleteButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.error,
    marginTop: 18,
    paddingHorizontal: 14,
  },
  confirmDeleteButtonDisabled: {
    opacity: 0.5,
  },
  confirmDeleteText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  cancelDeleteButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  cancelDeleteText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
