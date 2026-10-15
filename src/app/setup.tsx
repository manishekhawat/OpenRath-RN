/**
 * The car setup (Car.firstRun / Settings > Car): brand, model, shape, fuel and tank size, and
 * (from the 360 view) the colour. The name beside the logo, the service centre search, fuel
 * words, expected mileage and the 3D car all follow it.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Choice, Field, Heading, Screen } from '../components/ui';
import brands from '../data/brands.json';
import * as Car from '../logic/car';
import * as Car3D from '../logic/car3d';
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
  const [shape, setShape] = useState(Car3D.shape(prefs));
  const [colour, setColour] = useState(Car3D.colour(prefs));
  const [tank, setTank] = useState(prefs.str('tankL', ''));
  const [carName, setCarName] = useState(prefs.str('carName', ''));
  const [ownerName, setOwnerName] = useState(prefs.str('ownerName', ''));
  const brand = useMemo(() => brands.find((b) => b.id === brandId), [brandId]);
  const first = !Car.ready(prefs);

  const done = () => {
    const bName = brand ? brand.name : otherBrand.trim();
    Car.save(
      prefs,
      { brandId: brand ? brand.id : Car.idFor(bName), brandName: bName, model: model.trim(), fuel, tank: tank.trim(), shape, colour },
      (id, on) => Features.set(prefs, id, on),
    );
    if (carName.trim()) prefs.put('carName', carName.trim().toUpperCase());
    prefs.put('ownerName', ownerName.trim());
    router.replace('/');
  };

  return (
    <Screen title={first ? 'Welcome to OpenRath' : 'Your car'}>
      {first ? (
        <Text style={{ color: look.textDim, marginBottom: 8 }}>
          A short setup: the brand, model, shape, fuel and tank size. You can change it any time in Settings, Car.
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
      <Heading>What shape is it?</Heading>
      <Choice options={Car3D.SHAPES.map((id, i) => ({ id: id as string, label: Car3D.SHAPE_NAMES[i] }))} value={shape} onChange={setShape} />
      <Heading>Car colour</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {Car3D.COLOURS.map((c, i) => (
          <Pressable
            key={c}
            onPress={() => setColour(c)}
            accessibilityLabel={Car3D.COLOUR_NAMES[i]}
            style={{ alignItems: 'center', width: 72 }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c,
                borderWidth: colour.toUpperCase() === c ? 3 : 1,
                borderColor: colour.toUpperCase() === c ? look.accent : look.edge,
              }}
            />
            <Text style={{ color: look.textDim, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{Car3D.COLOUR_NAMES[i]}</Text>
          </Pressable>
        ))}
      </View>
      <Heading>Fuel</Heading>
      <Choice options={Car.FUELS.map((f, i) => ({ id: f, label: Car.FUEL_NAMES[i] }))} value={fuel} onChange={setFuel} />
      {fuel !== 'ev' ? (
        <Field
          label={fuel === 'cng' ? 'CNG cylinder, kg (leave empty if unsure)' : 'Fuel tank, litres (leave empty if unsure)'}
          value={tank}
          onChange={setTank}
          numeric
        />
      ) : null}
      <Heading>Names</Heading>
      <Field label="Name beside the logo (empty: the model's)" value={carName} onChange={setCarName} placeholder={Car.nameFor(model)} />
      <Field label="Your name, for the morning greeting" value={ownerName} onChange={setOwnerName} />
      <Button label={first ? 'Start' : 'Save'} kind="primary" onPress={done} />
    </Screen>
  );
}
