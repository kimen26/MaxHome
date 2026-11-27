"""Relevé ponctuel de vols directs aller-retour, dates flexibles, via le provider MaxVoyage (Google Flights).
Usage : MAXVOYAGE_DIR=../maxvoyage python scripts/vols_flex.py CDG KEF <dossier_sortie>
Dates en dur ci-dessous (Nouvel An 2026-27). Prix = total pour 2 adultes."""
import sys, json, time
from datetime import date
import os; sys.path.insert(0, os.environ.get("MAXVOYAGE_DIR", "../maxvoyage"))
from backend.provider import search_round_trip, _FETCHER, _fmt_dt
from backend.pax import PaxCounts
from fast_flights import FlightQuery, Passengers, create_query, get_flights
pax = PaxCounts(2, 0, 0)
o, d, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
res = []
for dep in (date(2026,12,29), date(2026,12,30), date(2026,12,31)):
    for ret in (date(2027,1,1), date(2027,1,2), date(2027,1,3), date(2027,1,4)):
        offers = []
        for _ in range(6):
            try: offers = search_round_trip(o, d, dep, ret, pax, max_stops=0)
            except Exception as e: print("ERR", e); offers = []
            if offers: break
            time.sleep(2)
        for x in offers:
            res.append(dict(dep=str(dep), ret=str(ret), total=x.price, airlines=x.airlines, stops=x.stops,
                            out=f"{x.legs[0]['dep'][11:]}->{x.legs[-1]['arr'][5:]}", url=x.booking_url))
        best = min([x.price for x in offers if x.stops == 0], default=None)
        print(o, d, dep, ret, "direct_min", best, "n", len(offers), flush=True)
        time.sleep(1)
# horaires retour du 1er janvier (aller simple, directs)
times = []
for _ in range(3):
    try:
        q = create_query(flights=[FlightQuery(date="2027-01-01", from_airport=d, to_airport=o)], trip="one-way",
                         seat="economy", passengers=Passengers(adults=2), language="fr", currency="EUR", max_stops=0)
        r = get_flights(q, integration=_FETCHER)
        times = [(f"{fl.flights[0].from_airport.code} {_fmt_dt(fl.flights[0].departure)}", list(fl.airlines or []), fl.price) for fl in r if len(fl.flights or []) == 1]
        if times: break
    except Exception as e: print("ERR1", type(e).__name__, e)
    time.sleep(2)
print(o, d, "RETOUR_1JAN", times, flush=True)
json.dump(dict(rt=res, jan1=times), open(f"{outdir}/flex_{o}_{d}.json", "w"), ensure_ascii=False, indent=1)
