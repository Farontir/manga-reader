import { Alert } from 'react-native';

export function confirmAdultSource(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Source avec contenu adulte',
      `${name} peut afficher des œuvres réservées aux adultes. Continuer ?`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuer', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
