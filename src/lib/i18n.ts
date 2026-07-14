export type Lang = "en" | "pl";

const dict = {
  en: {
    dashboard: "Dashboard",
    calendar: "Calendar",
    clients: "Clients",
    locations: "Locations",
    users: "Users",
    activity: "Activity",
    cleaning: "Cleaning",
    logout: "Log out",
    login: "Log in",
    email: "Email",
    password: "Password",
    arrivals_today: "Arrivals today",
    departures_today: "Departures today",
    standby_due: "Standby to resolve",
    occupancy_today: "Occupancy today",
    nights_balance: "Nights balance",
    reservations: "Reservations",
    payments: "Payments",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    confirmed: "Confirmed",
    standby: "Standby",
    cancelled: "Cancelled",
    hotel_overflow: "Hotel overflow",
    single: "Single",
    double: "Double",
    viewing_as: "Viewing as",
    exit_impersonation: "Exit",
  },
  pl: {
    dashboard: "Panel",
    calendar: "Kalendarz",
    clients: "Klienci",
    locations: "Lokalizacje",
    users: "Użytkownicy",
    activity: "Aktywność",
    cleaning: "Sprzątanie",
    logout: "Wyloguj",
    login: "Zaloguj",
    email: "Email",
    password: "Hasło",
    arrivals_today: "Przyjazdy dzisiaj",
    departures_today: "Wyjazdy dzisiaj",
    standby_due: "Standby do decyzji",
    occupancy_today: "Obłożenie dzisiaj",
    nights_balance: "Saldo nocy",
    reservations: "Rezerwacje",
    payments: "Płatności",
    save: "Zapisz",
    cancel: "Anuluj",
    delete: "Usuń",
    confirmed: "Potwierdzona",
    standby: "Standby",
    cancelled: "Anulowana",
    hotel_overflow: "Hotel zastępczy",
    single: "Pojedynczy",
    double: "Podwójny",
    viewing_as: "Widok jako",
    exit_impersonation: "Wyjdź",
  },
} as const;

export type TKey = keyof (typeof dict)["en"];

export function t(lang: Lang, key: TKey): string {
  return dict[lang][key] ?? dict.en[key] ?? key;
}

export function normalizeLang(v: string | undefined): Lang {
  return v === "pl" ? "pl" : "en";
}
