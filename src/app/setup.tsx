/**
 * The car setup (Car.firstRun / Settings > Car): brand, model, fuel and tank size. The name
 * beside the logo, the service centre search, fuel words and expected mileage all follow it.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Choice, Field, Heading, Screen } from '../components/ui';
import brands from '../data/brands.json';
import * as Car from '../logic/car';
import * as Features from '../logic/features';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

type Fuel = (typeof Car.FUELS)[number];

export default function Setup() {
  const { prefs } = usePrefs();
  const look = useLook();
  const [brandId, setBrandId] = useState(Car.brand(prefs));
  const [otherBrand, setOtherBrand] = useState(brands.some((b) => b.id === Car.brand(prefs)) ? '' : Car.brandName(prefs));
  const [model, setModel] = useState(Car.model(prefs));
  const [fuel, setFuel] = useState<Fuel>(Car.fuel(prefs) as Fuel);
  const [tank, setTank] = useState(prefs.str('tank', ''));
  const [carName, setCarName] = useState(prefs.str('carName', ''));
  const [ownerName, setOwnerName] = useState(prefs.str('ownerName', ''));
  const brand = useMemo(() => brands.find((b) => b.id === brandId), [brandId]);
  const first = !Car.ready(prefs);

  const done = () => {
    const bName = brand ? brand.name : otherBrand.trim();
    Car.save(prefs, { brandId: brand ? brand.id : Car.idFor(bName), brandName: bName, model: model.trim(), fuel, tank: tank.trim() }, (id, on) =>
      Features.set(prefs, id, on),
    );
    if (carName.trim()) prefs.put('carName', carName.trim().toUpperCase());
    prefs.put('ownerName', ownerName.trim());
    router.replace('/');
  };

  return (
    <Screen title={first ? 'Welcome to OpenRath' : 'Your car'}>
      {first ? (
        <Text style={{ color: look.textDim, marginBottom: 8 }}>
          A short setup: the brand, model, fuel and tank size. You can change it any time in Settings, Car.
        </Text>
      ) : null}
      <Heading>Brand</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[...brands, { id: 'other', name: 'Other', models: [] as string[] }].map((b) => (
          <Pressable
            key={b.id}
            onPress={() => {
              setBrandId(b.id);
              setModel('');
            }}
            style={{
              borderWidth: 1,
              borderRadius: 20,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderColor: brandId === b.id ? look.accent : look.edge,
              backgroundColor: brandId === b.id ? look.accent : 'transparent',
            }}
          >
            <Text style={{ color: brandId === b.id ? look.background : look.text }}>{b.name}</Text>
          </Pressable>
        ))}
      </View>
      {brandId === 'other' || (brandId && !brand) ? <Field label="Brand name" value={otherBrand} onChange={setOtherBrand} /> : null}
      <Heading>Model</Heading>
      {brand && brand.models.length > 0 ? (
        <Choice options={brand.models.map((m) => ({ id: m, label: m }))} value={model} onChange={setModel} />
      ) : null}
      <Field label="Model (pick above or type it)" value={model} onChange={setModel} />
      <Heading>Fuel</Heading>
      <Choice options={Car.FUELS.map((f, i) => ({ id: f, label: Car.FUEL_NAMES[i] }))} value={fuel} onChange={setFuel} />
      {fuel !== 'ev' ? <Field label={fuel === 'cng' ? 'Tank size (kg)' : 'Tank size (litres)'} value={tank} onChange={setTank} numeric /> : null}
      <Heading>Names</Heading>
      <Field label="Name beside the logo (empty: the model's)" value={carName} onChange={setCarName} placeholder={Car.nameFor(model)} />
      <Field label="Your name, for the morning greeting" value={ownerName} onChange={setOwnerName} />
      <Button label={first ? 'Start' : 'Save'} kind="primary" onPress={done} />
    </Screen>
  );
}
