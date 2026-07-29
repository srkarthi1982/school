from pydantic import BaseModel, ConfigDict, Field


class CountryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True,populate_by_name=True)
    id: int
    value: str = Field(validation_alias='name')

    # model_config = {"from_attributes": True}
