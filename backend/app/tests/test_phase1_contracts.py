"""Tests Phase 1 — modèles et contrats importables."""

from app.db.models import Alerte, Capture, Pecheur, Position, Quota, Utilisateur, ZoneReglementee
from app.modules.alertes.schemas import AlerteRead
from app.modules.captures.schemas import CaptureCreate
from app.modules.dashboard.schemas import DashboardRead
from app.modules.geolocalisation.schemas import PositionCreate
from app.modules.pecheurs.schemas import PecheurCreate
from app.modules.quotas.schemas import QuotaRead
from app.modules.zones.schemas import ZoneCreate
from app.schemas.common import ErrorResponse, PointGeoJSON


def test_models_are_mapped() -> None:
    assert Utilisateur.__tablename__ == "utilisateurs"
    assert Pecheur.__tablename__ == "pecheurs"
    assert Position.__tablename__ == "positions"
    assert ZoneReglementee.__tablename__ == "zones_reglementees"
    assert Capture.__tablename__ == "captures"
    assert Quota.__tablename__ == "quotas"
    assert Alerte.__tablename__ == "alertes"
    assert "declencheur" in Alerte.__table__.c


def test_contracts_construct() -> None:
    point = PointGeoJSON(coordinates=(9.45, 0.39))
    assert point.type == "Point"
    err = ErrorResponse(detail="interdit", code="FORBIDDEN")
    assert err.code == "FORBIDDEN"
    assert PecheurCreate.model_fields["numero_licence"]
    assert PositionCreate.model_fields["position"]
    assert ZoneCreate.model_fields["geometrie"]
    assert CaptureCreate.model_fields["espece"]
    assert QuotaRead.model_fields["taux_consommation"]
    assert DashboardRead.model_fields["pecheurs_actifs"]
    assert AlerteRead.model_fields["declencheur"]
    from app.modules.dashboard.schemas import DashboardSeriesRead
    from app.modules.predictions.schemas import PredictionsRead

    assert DashboardSeriesRead.model_fields["volume_par_periode"]
    assert PredictionsRead.model_fields["penuries"]
