-- "Oferta" pasa a ser una marca que se pone a mano en el artículo (antes el catálogo la mostraba sola en todo
-- producto con descuento por cantidad). Los productos marcados salen primero en el catálogo y se filtran con "Ofertas".
alter table productos add column oferta boolean not null default false;
