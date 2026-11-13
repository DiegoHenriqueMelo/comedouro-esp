#include <Arduino.h>
#include <WiFi.h>
#include "secrets.h"
#include <Espalexa.h>
Espalexa espalexa;

// LED azul soldado na própria placa (seção 3.4 do plano).
const int BOARD_LED_PIN = 2;
const int EXTERNAL_LED_PIN = 4;
const int BUTTON_PIN = 19;
const int LEVEL_PIN = 34;
const int RED_PIN = 25;
const int GREEN_PIN = 26;
const int LED_ON = LOW;
const int LED_OFF = HIGH;
const int CAT_SENSOR_PIN = 27;
unsigned long lastBlinkAt = 0;
bool boardLedOn = false;
int lastButtonState = HIGH;
int pressCount = 0;
unsigned long lastChangeAt = 0;
bool serving = false;
unsigned long servingStartedAt = 0;
bool wifiConnected = false;
unsigned long lastLevelAt = 0;
int levelPercent = 100;
int lastCatState = HIGH;
int countVisit = 0;

void showColor(int pin)
{
  digitalWrite(RED_PIN, pin == RED_PIN ? LED_ON : LED_OFF);
  digitalWrite(GREEN_PIN, pin == GREEN_PIN ? LED_ON : LED_OFF);
  digitalWrite(EXTERNAL_LED_PIN, pin == EXTERNAL_LED_PIN ? LED_ON : LED_OFF);
}
void updateStatusLed()
{
  if (serving)
  {
    showColor(EXTERNAL_LED_PIN);
  }
  else if (levelPercent <= 20)
  {
    showColor(RED_PIN);
  }
  else
  {
    showColor(GREEN_PIN);
  }
}

void requestDispense()
{
  if (serving)
  {
    Serial.println("Recusado: já servindo.");
  }
  else
  {
    pressCount++;
    serving = true;
    servingStartedAt = millis();
    digitalWrite(EXTERNAL_LED_PIN, LED_ON);
    Serial.print("Contador de Porções: ");
    Serial.println(pressCount);
  }
}

void onAlexaChanged(uint8_t brightness)
{
  Serial.print("alexa mandou: ");
  Serial.println(brightness);
  if (brightness > 0)
  {
    requestDispense();
  }
};

void setup()
{
  Serial.begin(115200);
  pinMode(BOARD_LED_PIN, OUTPUT);
  pinMode(EXTERNAL_LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(CAT_SENSOR_PIN, INPUT);
  digitalWrite(RED_PIN, LED_OFF);
  digitalWrite(GREEN_PIN, LED_OFF);
  digitalWrite(EXTERNAL_LED_PIN, LED_OFF);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop()
{
  int buttonState = digitalRead(BUTTON_PIN);
  int catSensorState = digitalRead(CAT_SENSOR_PIN);
  if (WiFi.status() == WL_CONNECTED && wifiConnected == false)
  {
    wifiConnected = !wifiConnected;
    Serial.print("Wi-FI Conectado: ");
    Serial.println(WiFi.localIP());
    espalexa.addDevice("alimentador", onAlexaChanged);
    espalexa.begin();
  }

  if (wifiConnected)
  {
    espalexa.loop();
  }

  if (catSensorState == LOW && lastCatState == HIGH)
  {
    Serial.println("Gato chegou na tigela");
    lastCatState = catSensorState;
    countVisit++;
  }

  if (catSensorState == HIGH && lastCatState == LOW)
  {
    Serial.println("Gato saiu");
    lastCatState = catSensorState;
  }

  if (buttonState == LOW && lastButtonState == HIGH && millis() - lastChangeAt > 50)
  {
    requestDispense();
  }

  if (buttonState != lastButtonState)
  {
    lastChangeAt = millis();
  }
  if (millis() - lastBlinkAt >= 500)
  {
    lastBlinkAt = millis();
    boardLedOn = !boardLedOn;
    digitalWrite(BOARD_LED_PIN, boardLedOn);
  }
  if (serving == true && millis() - servingStartedAt >= 1000)
  {
    digitalWrite(EXTERNAL_LED_PIN, LED_OFF);
    serving = false;
    Serial.println("Porção servida");
    if (wifiConnected)
    {
      espalexa.getDevice(0)->setValue(0);
    }
  }
  if (millis() - lastLevelAt >= 1000)
  {
    lastLevelAt = millis();
    int raw = analogRead(LEVEL_PIN);
    levelPercent = map(raw, 0, 4095, 0, 100);
    Serial.print("Garrafa: ");
    Serial.print(levelPercent);
    Serial.println("%");
  }
  updateStatusLed();
  lastButtonState = buttonState;
}
