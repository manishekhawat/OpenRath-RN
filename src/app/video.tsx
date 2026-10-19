/**
 * The video window as a page of its own (1.38): the video box, big. The picture shows only when
 * the car is stopped; the sound keeps going. Opened from the music page, or the dashboard's box.
 */
import { StyleSheet, View } from 'react-native';

import { Screen } from '../components/ui';
import { VideoBox } from '../components/VideoBox';

export default function VideoScreen() {
  return (
    <Screen title="Video window" scroll={false}>
      <View style={styles.fill}>
        <VideoBox style={styles.box} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, margin: 12 },
  box: { flex: 1 },
});
